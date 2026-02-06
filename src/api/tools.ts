import type { WebClient } from '@slack/web-api';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tool registry: maps MCP tool names → permission keys + Slack API executors
// ---------------------------------------------------------------------------

export interface ToolContext {
  client: WebClient;
  teamId: string | undefined; // Required for Enterprise Grid API calls
}

export interface ToolDefinition {
  name: string;
  description: string;
  permissionKey: string;
  operation: 'read' | 'write';
  inputSchema: z.ZodType;
  execute: (
    ctx: ToolContext,
    input: Record<string, unknown>
  ) => Promise<unknown>;
}

// --- Input schemas ---

const listChannelsSchema = z.object({
  limit: z.number().min(1).max(200).optional().default(100),
  cursor: z.string().optional(),
});

const readChannelSchema = z.object({
  channel: z.string().min(1),
  limit: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});

const postMessageSchema = z.object({
  channel: z.string().min(1),
  text: z.string().min(1),
});

const replyThreadSchema = z.object({
  channel: z.string().min(1),
  thread_ts: z.string().min(1),
  text: z.string().min(1),
});

const listUsersSchema = z.object({
  limit: z.number().min(1).max(200).optional().default(100),
  cursor: z.string().optional(),
});

// --- Tool definitions ---

export const TOOLS: ToolDefinition[] = [
  {
    name: 'slack_list_channels',
    description: 'List public channels the bot is a member of.',
    permissionKey: 'channels',
    operation: 'read',
    inputSchema: listChannelsSchema,
    execute: async (ctx, input) => {
      const args = listChannelsSchema.parse(input);
      const result = await ctx.client.conversations.list({
        team_id: ctx.teamId,
        limit: args.limit,
        cursor: args.cursor,
        types: 'public_channel',
      });
      return {
        channels: (result.channels ?? []).map(c => ({
          id: c.id,
          name: c.name,
          topic: (c as Record<string, unknown>).topic,
          purpose: (c as Record<string, unknown>).purpose,
          num_members: c.num_members,
        })),
        next_cursor: result.response_metadata?.next_cursor || null,
      };
    },
  },
  {
    name: 'slack_read_channel',
    description: 'Read recent messages from a channel.',
    permissionKey: 'channels',
    operation: 'read',
    inputSchema: readChannelSchema,
    execute: async (ctx, input) => {
      const args = readChannelSchema.parse(input);
      const result = await ctx.client.conversations.history({
        channel: args.channel,
        limit: args.limit,
        cursor: args.cursor,
      });
      return {
        messages: (result.messages ?? []).map(m => ({
          user: m.user,
          text: m.text,
          ts: m.ts,
          thread_ts: (m as Record<string, unknown>).thread_ts,
        })),
        has_more: result.has_more ?? false,
        next_cursor: result.response_metadata?.next_cursor || null,
      };
    },
  },
  {
    name: 'slack_post_message',
    description: 'Post a new message to a channel.',
    permissionKey: 'chat',
    operation: 'write',
    inputSchema: postMessageSchema,
    execute: async (ctx, input) => {
      const args = postMessageSchema.parse(input);
      const result = await ctx.client.chat.postMessage({
        channel: args.channel,
        text: args.text,
      });
      return { ok: result.ok, ts: result.ts, channel: result.channel };
    },
  },
  {
    name: 'slack_reply_thread',
    description: 'Reply to an existing message thread.',
    permissionKey: 'chat',
    operation: 'write',
    inputSchema: replyThreadSchema,
    execute: async (ctx, input) => {
      const args = replyThreadSchema.parse(input);
      const result = await ctx.client.chat.postMessage({
        channel: args.channel,
        thread_ts: args.thread_ts,
        text: args.text,
      });
      return { ok: result.ok, ts: result.ts, channel: result.channel };
    },
  },
  {
    name: 'slack_list_users',
    description: 'List users in the workspace.',
    permissionKey: 'users',
    operation: 'read',
    inputSchema: listUsersSchema,
    execute: async (ctx, input) => {
      const args = listUsersSchema.parse(input);
      const result = await ctx.client.users.list({
        team_id: ctx.teamId,
        limit: args.limit,
        cursor: args.cursor,
      });
      return {
        users: (result.members ?? []).map(m => ({
          id: m.id,
          name: m.name,
          real_name: m.real_name,
          is_bot: m.is_bot,
          deleted: m.deleted,
        })),
        next_cursor: result.response_metadata?.next_cursor || null,
      };
    },
  },
];

/** Look up a tool definition by name. */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find(t => t.name === name);
}

/**
 * Build a JSON-serialisable list of tools (for MCP tools/list responses).
 * Converts Zod schemas to JSON Schema objects.
 */
export function toolsToMcpFormat(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return TOOLS.map(t => {
    const shape = (t.inputSchema as z.ZodObject<z.ZodRawShape>).shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodType = value as z.ZodTypeAny;
      let prop: Record<string, unknown> = { type: 'string' };

      if (zodType instanceof z.ZodNumber) {
        prop = { type: 'number' };
      } else if (zodType instanceof z.ZodString) {
        prop = { type: 'string' };
      } else if (
        zodType instanceof z.ZodOptional ||
        zodType instanceof z.ZodDefault
      ) {
        const inner =
          zodType instanceof z.ZodDefault
            ? zodType._def.innerType
            : zodType._def.innerType;
        if (inner instanceof z.ZodNumber) {
          prop = { type: 'number' };
        } else {
          prop = { type: 'string' };
        }
      }

      properties[key] = prop;

      if (
        !(zodType instanceof z.ZodOptional) &&
        !(zodType instanceof z.ZodDefault)
      ) {
        required.push(key);
      }
    }

    return {
      name: t.name,
      description: t.description,
      inputSchema: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    };
  });
}
