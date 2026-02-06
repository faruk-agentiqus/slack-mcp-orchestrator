#!/usr/bin/env node

/**
 * @agentiqus/slack-mcp-client
 *
 * A thin stdio MCP server that forwards all tool calls to the
 * MCP Orchestrator HTTP API. It holds no business logic — just
 * authentication forwarding and protocol bridging.
 *
 * Required env vars:
 *   MCP_TOKEN   - Per-user JWT issued by the orchestrator
 *   MCP_API_URL - Base URL of the orchestrator API (e.g. https://host/api/mcp)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MCP_TOKEN = process.env.MCP_TOKEN;
const MCP_API_URL = process.env.MCP_API_URL;

if (!MCP_TOKEN) {
  process.stderr.write('ERROR: MCP_TOKEN environment variable is required.\n');
  process.exit(1);
}
if (!MCP_API_URL) {
  process.stderr.write(
    'ERROR: MCP_API_URL environment variable is required.\n'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function apiRequest(
  path: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const url = `${MCP_API_URL}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MCP_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    let message: string;
    try {
      const json = JSON.parse(text);
      message = json.error ?? text;
    } catch {
      message = text;
    }

    if (response.status === 401) {
      throw new Error(
        `Authentication failed: ${message}. Regenerate your MCP config in Slack.`
      );
    }
    if (response.status === 403) {
      throw new Error(`Permission denied: ${message}`);
    }
    throw new Error(`API error (${response.status}): ${message}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: '@agentiqus/slack-mcp-client', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// --- tools/list ---------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const result = (await apiRequest('/tools/list', {})) as {
    tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
  };
  return { tools: result.tools };
});

// --- tools/call ---------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const result = (await apiRequest('/tools/call', {
      name: request.params.name,
      arguments: request.params.arguments ?? {},
    })) as { content: Array<{ type: string; text: string }> };

    return { content: result.content };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('Slack MCP client connected via stdio.\n');
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
