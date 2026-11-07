# Raycast MCP Server

A macOS Model Context Protocol (MCP) server that lets AI assistants invoke nine Raycast and local-automation tools. It uses Raycast URLs, AppleScript, and standard macOS commands, so the automation tools require Raycast on macOS.

## Features

### Nine registered tools

1. **raycast_search** - Open Raycast, enter a query, and optionally execute the first result
2. **raycast_open** - Open a Raycast command or extension URL
3. **raycast_clipboard** - Show, clear, copy, or paste clipboard content
4. **raycast_shortcut** - Trigger a predefined Raycast URL or validated keyboard shortcut
5. **raycast_window** - Show, hide, toggle, or focus Raycast
6. **raycast_system** - Invoke selected macOS system actions
7. **raycast_auth** - Audit configured environment credentials, print setup instructions, and validate supported credentials
8. **raycast_extensions** - Drive supported extension-management flows
9. **raycast_workflows** - Store and execute local workflow definitions

### 🚀 **Capabilities**
- Uses `execFile` and `spawn` without shell interpolation
- Validates and length-bounds user-controlled strings
- Uses allowlisted URL schemes and constrained command identifiers
- Supports local workflows, clipboard operations, navigation, and system automation
- Can validate GitHub, Notion, and Figma credentials without returning the credential itself

### Authentication scope

This project is not an OAuth callback server and does not exchange authorization codes. The `raycast_auth oauth` action opens provider authorization URLs, but those templates require you to supply real client IDs and redirect URLs before they are usable. Credential validation is currently implemented for GitHub, Notion, and Figma; other listed services return an explicit “not implemented” result.

## Installation

### Via Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "raycast": {
      "command": "node",
      "args": ["/path/to/raycast-mcp/dist/index.js"],
      "env": {
        "RAYCAST_API_KEY": "${RAYCAST_API_KEY}",
        "RAYCAST_TEAM_ID": "${RAYCAST_TEAM_ID}"
      }
    }
  }
}
```

### Via NPX

```bash
npx raycast-mcp-server@1.0.1
```

### Via Smithery

```bash
smithery install raycast-mcp-server
```

## Development

### Prerequisites
- Node.js 18+
- macOS with Raycast installed for automation calls
- Accessibility permission for your terminal or MCP host when using AppleScript keyboard control

### Setup

```bash
git clone https://github.com/ExpertVagabond/raycast-mcp-server.git
cd raycast-mcp-server
npm install
npm run build
npm test
```

### Running Locally

```bash
npm start
```

### Building for Production

```bash
npm run build
```

## Usage Examples

### Authentication Management
```bash
# Setup GitHub authentication
{"tool": "raycast_auth", "arguments": {"action": "setup", "service": "github"}}

# Validate credentials  
{"tool": "raycast_auth", "arguments": {"action": "validate", "service": "github"}}
```

### Extension Management
```bash
# Search for extensions
{"tool": "raycast_extensions", "arguments": {"action": "search", "query": "github"}}

# List installed extensions
{"tool": "raycast_extensions", "arguments": {"action": "list"}}
```

### Workflow Automation
```bash
# Create a custom workflow
{"tool": "raycast_workflows", "arguments": {
  "action": "create",
  "name": "morning-routine",
  "steps": [
    {"type": "command", "action": "open-calendar"},
    {"type": "api_call", "action": "fetch-weather"},
    {"type": "notification", "action": "daily-summary"}
  ]
}}

# Execute a workflow
{"tool": "raycast_workflows", "arguments": {"action": "execute", "name": "morning-routine"}}
```

## Environment variables

- `RAYCAST_API_KEY` and `RAYCAST_TEAM_ID` - optional values reported by the credential audit
- `GITHUB_TOKEN`, `NOTION_TOKEN`, `FIGMA_TOKEN` - supported credential validation
- `SLACK_TOKEN`, `LINEAR_TOKEN`, `JIRA_TOKEN` - detected by the audit; remote validation is not implemented

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable  
5. Submit a pull request

## License

MIT

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/ExpertVagabond/raycast-mcp-server/issues) page.

---

Built with ❤️ for the Raycast and MCP communities.
