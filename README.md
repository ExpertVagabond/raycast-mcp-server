# Raycast MCP Server

A comprehensive Model Context Protocol (MCP) server for Raycast workflow automation, providing 9 powerful tools to integrate Raycast with AI assistants like Claude.

## Features

### 🔧 **9 Comprehensive Tools**

1. **raycast_auth** - Manage Raycast and service authentication
2. **raycast_extensions** - Manage Raycast extensions and store integration  
3. **raycast_workflows** - Create and manage Raycast workflows and automations
4. **raycast_search** - Search and launch applications, files, or commands via Raycast
5. **raycast_clipboard** - Manage clipboard history via Raycast
6. **raycast_shortcut** - Trigger Raycast shortcuts and hotkeys
7. **raycast_window** - Control Raycast window behavior
8. **raycast_system** - Access system functions through Raycast
9. **Plus additional workflow tools**

### 🚀 **Capabilities**
- Full OAuth integration support for multiple services
- Extension management and publishing workflow
- Custom workflow creation and execution
- System automation and control
- Clipboard management
- Search and navigation

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

### Via NPX (Coming Soon)

```bash
npx raycast-mcp-server
```

### Via Smithery

```bash
smithery install raycast-mcp-server
```

## Development

### Prerequisites
- Node.js 18+
- TypeScript
- Raycast installed on macOS

### Setup

```bash
git clone https://github.com/ExpertVagabond/raycast-mcp-server.git
cd raycast-mcp-server
npm install
npm run build
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

## Environment Variables

- `RAYCAST_API_KEY` - Raycast API key (if available)
- `RAYCAST_TEAM_ID` - Raycast team ID (if applicable)

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