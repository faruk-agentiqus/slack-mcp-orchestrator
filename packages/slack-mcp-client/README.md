# @agentiqus/slack-mcp-client

A thin stdio MCP server that connects AI tools (Cursor, Claude Desktop) to Slack through the [MCP Orchestrator](https://github.com/faruk-agentiqus/slack-mcp-orchestrator).

## Usage

This package is not used directly. The MCP Orchestrator Slack app generates a configuration JSON for you.

1. Install the MCP Orchestrator app in your Slack workspace
2. Open the app's Home tab, set your permissions, and click **Generate MCP Config**
3. Paste the generated JSON into your AI tool's MCP config file

### Cursor

Paste into `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@agentiqus/slack-mcp-client"],
      "env": {
        "MCP_TOKEN": "<your-token>",
        "MCP_API_URL": "https://slack-mcp-orchestrator.fly.dev/api/mcp"
      }
    }
  }
}
```

### Claude Desktop

Paste into your Claude Desktop config file.

## Environment Variables

| Variable | Description |
|---|---|
| `MCP_TOKEN` | Per-user JWT issued by the MCP Orchestrator Slack app |
| `MCP_API_URL` | Base URL of the MCP Orchestrator API |

## How It Works

This package runs as a local stdio process. It receives MCP tool calls from your AI tool, forwards them to the MCP Orchestrator API with your JWT, and returns the results. All permission enforcement happens server-side. Your Slack bot token never leaves the server.

## License

MIT
