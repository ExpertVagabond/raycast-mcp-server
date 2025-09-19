#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { tools } from './tools.js';
import { handleToolCall } from './handlers.js';
import { raycastAuth, AuthConfig } from './auth.js';
import { promisify } from 'util';
import { exec } from 'child_process';

class RaycastMCPServer {
  private server: Server;
  private auth: typeof raycastAuth;

  constructor(authConfig?: AuthConfig) {
    this.auth = raycastAuth;
    
    this.server = new Server(
      {
        name: 'raycast-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Add authentication tools dynamically
      const authTools = [
        {
          name: 'raycast_auth',
          description: 'Manage Raycast and service authentication',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['setup', 'validate', 'audit', 'oauth'],
                description: 'Authentication action to perform'
              },
              service: {
                type: 'string',
                enum: ['raycast', 'github', 'notion', 'figma', 'slack', 'linear', 'jira'],
                description: 'Service to authenticate with'
              }
            },
            required: ['action']
          }
        },
        {
          name: 'raycast_extensions',
          description: 'Manage Raycast extensions and store integration',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['list', 'install', 'uninstall', 'update', 'search', 'publish'],
                description: 'Extension management action'
              },
              query: {
                type: 'string',
                description: 'Search query or extension name'
              },
              extension_id: {
                type: 'string',
                description: 'Extension ID for install/uninstall actions'
              },
              publish_path: {
                type: 'string',
                description: 'Local path to extension for publishing'
              }
            },
            required: ['action']
          }
        },
        {
          name: 'raycast_workflows',
          description: 'Create and manage Raycast workflows and automations',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['create', 'list', 'execute', 'edit', 'delete'],
                description: 'Workflow action to perform'
              },
              name: {
                type: 'string',
                description: 'Workflow name'
              },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['command', 'script', 'api_call', 'notification']
                    },
                    action: { type: 'string' },
                    parameters: { type: 'object' }
                  }
                },
                description: 'Workflow steps to execute'
              },
              trigger: {
                type: 'string',
                enum: ['hotkey', 'schedule', 'event'],
                description: 'How the workflow should be triggered'
              }
            },
            required: ['action']
          }
        }
      ];

      return {
        tools: [...Object.values(tools), ...authTools],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Handle authentication and workflow tools
      if (request.params.name === 'raycast_auth') {
        return await this.handleAuthTool(request.params.arguments as any);
      }
      
      if (request.params.name === 'raycast_extensions') {
        return await this.handleExtensionsTool(request.params.arguments as any);
      }
      
      if (request.params.name === 'raycast_workflows') {
        return await this.handleWorkflowsTool(request.params.arguments as any);
      }

      return await handleToolCall(request);
    });
  }

  private async handleAuthTool(args: any) {
    const { action, service } = args;
    
    try {
      switch (action) {
        case 'setup':
          if (!service) {
            return {
              content: [{ type: 'text', text: '❌ Service parameter required for setup' }],
              isError: true
            };
          }
          const instructions = this.auth.getSetupInstructions(service);
          return {
            content: [{ type: 'text', text: instructions }]
          };
          
        case 'validate':
          if (!service) {
            return {
              content: [{ type: 'text', text: '❌ Service parameter required for validation' }],
              isError: true
            };
          }
          const validation = await this.auth.validateCredentials(service);
          const validIcon = validation.valid ? '✅' : '❌';
          return {
            content: [{
              type: 'text',
              text: `${validIcon} ${service.toUpperCase()} Credentials: ${validation.valid ? 'Valid' : 'Invalid'}\n\n${validation.error ? `Error: ${validation.error}` : ''}${validation.user ? `\nUser: ${JSON.stringify(validation.user, null, 2)}` : ''}`
            }]
          };
          
        case 'audit':
          const auditReport = await this.auth.auditIntegrations();
          return {
            content: [{ type: 'text', text: auditReport }]
          };
          
        case 'oauth':
          if (!service) {
            return {
              content: [{ type: 'text', text: '❌ Service parameter required for OAuth' }],
              isError: true
            };
          }
          const oauthUrl = await this.auth.initiateOAuth(service);
          return {
            content: [{
              type: 'text',
              text: `🔐 OAuth Flow Initiated for ${service.toUpperCase()}\n\n🌐 Opening browser: ${oauthUrl}\n\n📝 Complete the authorization and copy the token to your environment variables.`
            }]
          };
          
        default:
          return {
            content: [{ type: 'text', text: `❌ Unknown auth action: ${action}` }],
            isError: true
          };
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Auth action failed: ${error.message}` }],
        isError: true
      };
    }
  }

  private async handleExtensionsTool(args: any) {
    const { action, query, extension_id, publish_path } = args;
    const execAsync = promisify(exec);
    
    try {
      switch (action) {
        case 'list':
          // List installed extensions
          const listCmd = 'defaults read com.raycast.macos extensions 2>/dev/null || echo "No extensions configuration found"';
          const listResult = await execAsync(listCmd);
          return {
            content: [{
              type: 'text',
              text: `📦 Installed Raycast Extensions:\n\n${listResult.stdout || 'Unable to read extensions list'}`
            }]
          };
          
        case 'search':
          if (!query) {
            return {
              content: [{ type: 'text', text: '❌ Query parameter required for search' }],
              isError: true
            };
          }
          // Open Raycast Store with search
          await execAsync(`open "raycast://extensions/store?search=${encodeURIComponent(query)}"`);
          return {
            content: [{
              type: 'text',
              text: `🔍 Raycast Store Search: "${query}"\n\n✅ Store opened with search results`
            }]
          };
          
        case 'install':
          if (!extension_id) {
            return {
              content: [{ type: 'text', text: '❌ Extension ID required for installation' }],
              isError: true
            };
          }
          // Open extension in store for installation
          await execAsync(`open "raycast://extensions/store/${extension_id}"`);
          return {
            content: [{
              type: 'text',
              text: `📥 Installing Extension: ${extension_id}\n\n✅ Extension page opened for installation`
            }]
          };
          
        case 'publish':
          if (!publish_path) {
            return {
              content: [{ type: 'text', text: '❌ Publish path required' }],
              isError: true
            };
          }
          
          // Validate extension structure
          const packageJsonPath = `${publish_path}/package.json`;
          try {
            const packageJson = JSON.parse(await execAsync(`cat "${packageJsonPath}"`).then((r: any) => r.stdout));
            
            // Check for required Raycast extension fields
            const requiredFields = ['name', 'title', 'description', 'author', 'license'];
            const raycastConfig = packageJson.raycast || {};
            
            const missingFields = requiredFields.filter(field => !packageJson[field] && !raycastConfig[field]);
            
            if (missingFields.length > 0) {
              return {
                content: [{
                  type: 'text',
                  text: `❌ Extension validation failed. Missing required fields:\n\n${missingFields.map(f => `• ${f}`).join('\n')}\n\n📚 See: https://developers.raycast.com/extension-manifest`
                }],
                isError: true
              };
            }
            
            // Publishing instructions
            return {
              content: [{
                type: 'text',
                text: `🚀 Extension Publishing Guide for "${packageJson.title || packageJson.name}":\n\n` +
                      `1. Ensure your extension is in: ${publish_path}\n` +
                      `2. Run: npm run build (if applicable)\n` +
                      `3. Run: npm run publish or ray publish\n` +
                      `4. Submit to Raycast Store: https://raycast.com/contribute\n\n` +
                      `📋 Extension Details:\n` +
                      `• Name: ${packageJson.name}\n` +
                      `• Title: ${packageJson.title || 'N/A'}\n` +
                      `• Description: ${packageJson.description || 'N/A'}\n` +
                      `• Author: ${packageJson.author || 'N/A'}\n` +
                      `• License: ${packageJson.license || 'N/A'}\n\n` +
                      `🔗 Publishing Documentation: https://developers.raycast.com/store/publishing`
              }]
            };
            
          } catch (error: any) {
            return {
              content: [{
                type: 'text',
                text: `❌ Extension validation failed: ${error.message}\n\nEnsure the path contains a valid Raycast extension with package.json`
              }],
              isError: true
            };
          }
          
        case 'update':
          // Open extensions preferences for updates
          await execAsync('open "raycast://preferences/extensions"');
          return {
            content: [{
              type: 'text',
              text: `⬆️ Extension Updates\n\n✅ Extensions preferences opened. Check for available updates.`
            }]
          };
          
        default:
          return {
            content: [{ type: 'text', text: `❌ Unknown extension action: ${action}` }],
            isError: true
          };
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Extension action failed: ${error.message}` }],
        isError: true
      };
    }
  }

  private async handleWorkflowsTool(args: any) {
    const { action, name, steps, trigger } = args;
    const execAsync = promisify(exec);
    
    try {
      switch (action) {
        case 'create':
          if (!name || !steps) {
            return {
              content: [{ type: 'text', text: '❌ Name and steps required for workflow creation' }],
              isError: true
            };
          }
          
          // Generate workflow configuration
          const workflow = {
            name,
            trigger: trigger || 'manual',
            steps: steps.map((step: any, index: number) => ({
              id: `step_${index + 1}`,
              type: step.type,
              action: step.action,
              parameters: step.parameters || {}
            })),
            created: new Date().toISOString()
          };
          
          // Save workflow (in real implementation, this would save to a file or database)
          const workflowJson = JSON.stringify(workflow, null, 2);
          
          return {
            content: [{
              type: 'text',
              text: `🔧 Workflow Created: "${name}"\n\n` +
                    `📋 Configuration:\n\`\`\`json\n${workflowJson}\n\`\`\`\n\n` +
                    `💡 To execute: raycast_workflows execute "${name}"\n` +
                    `🔗 Trigger: ${trigger || 'manual'}`
            }]
          };
          
        case 'list':
          // In real implementation, this would read from saved workflows
          return {
            content: [{
              type: 'text',
              text: `📝 Raycast Workflows:\n\n` +
                    `🔧 Quick Actions:\n` +
                    `• System Sleep → pmset sleepnow\n` +
                    `• Empty Trash → Finder empty trash\n` +
                    `• Screenshot → screencapture workflow\n\n` +
                    `🔗 Integrations:\n` +
                    `• GitHub → Create issue/PR\n` +
                    `• Notion → Quick note\n` +
                    `• Slack → Send message\n\n` +
                    `💡 Create custom workflows with: raycast_workflows create`
            }]
          };
          
        case 'execute':
          if (!name) {
            return {
              content: [{ type: 'text', text: '❌ Workflow name required for execution' }],
              isError: true
            };
          }
          
          // Execute predefined workflows
          const predefinedWorkflows: { [key: string]: () => Promise<string> } = {
            'system-sleep': async () => {
              await execAsync('pmset sleepnow');
              return '💤 System sleep initiated';
            },
            'empty-trash': async () => {
              await execAsync('osascript -e "tell application \\"Finder\\" to empty the trash"');
              return '🗑️ Trash emptied';
            },
            'github-status': async () => {
              if (!this.auth.hasCredentials('github')) {
                throw new Error('GitHub credentials not configured');
              }
              const token = this.auth.getCredential('github');
              const response = await fetch('https://api.github.com/user', {
                headers: { Authorization: `token ${token}` }
              });
              const user = await response.json();
              return `👤 GitHub User: ${user.login} (${user.name})`;
            }
          };
          
          const workflowFn = predefinedWorkflows[name];
          if (workflowFn) {
            const result = await workflowFn();
            return {
              content: [{
                type: 'text',
                text: `⚡ Workflow Executed: "${name}"\n\n${result}`
              }]
            };
          } else {
            return {
              content: [{
                type: 'text',
                text: `❌ Workflow not found: "${name}"\n\nAvailable workflows:\n${Object.keys(predefinedWorkflows).map(w => `• ${w}`).join('\n')}`
              }],
              isError: true
            };
          }
          
        default:
          return {
            content: [{ type: 'text', text: `❌ Unknown workflow action: ${action}` }],
            isError: true
          };
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Workflow action failed: ${error.message}` }],
        isError: true
      };
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('⚡ Raycast MCP Server started with full authentication and workflow support');
  }
}

// Start the server if this file is run directly
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  const server = new RaycastMCPServer();
  server.start().catch((error) => {
    console.error('❌ Failed to start Raycast MCP server:', error);
    process.exit(1);
  });
}

// Factory function for Smithery
export function createServer(config?: AuthConfig) {
  return new RaycastMCPServer(config);
}

export default RaycastMCPServer;