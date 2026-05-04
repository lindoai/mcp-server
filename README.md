# @lindoai/mcp-server

MCP (Model Context Protocol) server for [Lindo AI](https://lindo.ai) — create websites, pages, and blog posts with AI directly from Claude, Cursor, Kiro, Windsurf, and other MCP-compatible tools.

## Setup

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "lindo": {
      "command": "npx",
      "args": ["-y", "@lindoai/mcp-server"],
      "env": {
        "LINDO_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Where to add this config

| Client | Config file |
|--------|------------|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |
| Claude Code | `.claude/settings.json` |
| Cursor | `.cursor/mcp.json` |
| Kiro | `.kiro/settings/mcp.json` |
| Windsurf | MCP settings in IDE |

### Getting your API key

1. Go to [app.lindo.ai](https://app.lindo.ai)
2. Navigate to Workspace Settings → API Keys
3. Create a new API key
4. Copy the key and paste it as `LINDO_API_KEY`

Requires a **Business** or **Whitelabel** plan.

## Available Tools

### Websites
- **create_website** — Create a new website using AI from a text prompt
- **list_websites** — List all websites in your workspace

### Pages
- **create_page** — Create a new page on a website using AI
- **publish_blog** — Publish a static blog post with markdown content

### Blog
- **create_blog** — Generate a blog post on a website using AI

### Clients
- **create_client** — Create a new client
- **list_clients** — List all clients
- **assign_website** — Assign a website to a client
- **generate_magic_link** — Generate a client login link

### Credits
- **allocate_credits** — Allocate credits to a client

## Scheduling

The `create_website`, `create_page`, and `create_blog` tools support an optional `schedule_at` parameter (ISO 8601 datetime) to schedule the workflow for a future time.

## Remote MCP Server

You can also connect via the remote MCP endpoint without installing anything:

```
https://mcp.lindo.ai/mcp
```

## Links

- [Lindo AI](https://lindo.ai)
- [API Documentation](https://lindo.ai/docs)
- [Dashboard](https://app.lindo.ai)
