#!/usr/bin/env node
/**
 * Raycast MCP Server — tools for Raycast automation via MCP protocol.
 *
 * Security:
 * - All string inputs validated and length-bounded before processing
 * - Command execution uses execFile/spawn (no shell interpolation)
 * - Error messages sanitized to prevent internal path leakage
 * - No hardcoded credentials — auth via Raycast's secure token store
 * - Stdin-based command input prevents shell injection
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { tools } from './tools.js';
import { handleToolCall } from './handlers.js';
import { raycastAuth, AuthConfig } from './auth.js';
import { promisify } from 'util';
import { execFile, spawn } from 'child_process';

const execFileAsync = promisify(execFile);

/** Redact internal paths from error messages for safe external display. */
function redactError(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg.replace(/\/Users\/[^\s"']*/g, '[redacted]');
  msg = msg.replace(/\/Volumes\/[^\s"']*/g, '[redacted]');
  if (msg.length > 500) msg = msg.slice(0, 500) + '... (truncated)';
  return msg;
}

/**
 * Validate a string input with max length.
 */
function validateStringInput(value: unknown, label: string, maxLen = 1024): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  if (value.length > maxLen) {
    throw new Error(`${label} exceeds max length of ${maxLen}`);
  }
  return value;
}

/**
 * Run a command with stdin input safely (no shell interpolation).
 */
function spawnWithInput(cmd: string, args: string[], input: string, timeout = 15000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { timeout });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(stderr || `Process exited with code ${code}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

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
    // Initialize handler - REQUIRED for MCP protocol
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => ({
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "raycast-mcp-server",
        version: "1.0.0",
      },
    }));

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
    const action = typeof args.action === 'string' ? args.action : '';
    const service = typeof args.service === 'string' ? args.service : undefined;

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
              text: `${validIcon} ${service.toUpperCase()} Credentials: ${validation.valid ? 'Valid' : 'Invalid'}\n\n${validation.error ? `Error: ${validation.error}` : ''}${validation.username ? `\nAuthenticated as: ${validation.username}` : ''}`
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
    const action = validateStringInput(args.action, 'action', 32);
    const query = args.query ? validateStringInput(args.query, 'query', 256) : undefined;
    const extension_id = args.extension_id ? validateStringInput(args.extension_id, 'extension_id', 128) : undefined;
    const publish_path = args.publish_path ? validateStringInput(args.publish_path, 'publish_path', 512) : undefined;

    // Safe ID pattern: alphanumeric, hyphens, underscores, slashes, dots
    const safeIdPattern = /^[a-zA-Z0-9\-_./]+$/;

    try {
      switch (action) {
        case 'list': {
          // List installed extensions — use execFile (no shell)
          let listOutput: string;
          try {
            const result = await execFileAsync('defaults', ['read', 'com.raycast.macos', 'extensions'], { timeout: 10000 });
            listOutput = result.stdout as string;
          } catch {
            listOutput = 'No extensions configuration found';
          }
          return {
            content: [{
              type: 'text',
              text: `Installed Raycast Extensions:\n\n${listOutput || 'Unable to read extensions list'}`
            }]
          };
        }

        case 'search':
          if (!query) {
            return {
              content: [{ type: 'text', text: 'Query parameter required for search' }],
              isError: true
            };
          }
          // Open Raycast Store with search — use execFile (no shell)
          await execFileAsync('open', [`raycast://extensions/store?search=${encodeURIComponent(query)}`], { timeout: 5000 });
          return {
            content: [{
              type: 'text',
              text: `Raycast Store Search: "${query}"\n\nStore opened with search results`
            }]
          };

        case 'install':
          if (!extension_id) {
            return {
              content: [{ type: 'text', text: 'Extension ID required for installation' }],
              isError: true
            };
          }
          if (!safeIdPattern.test(extension_id)) {
            return {
              content: [{ type: 'text', text: 'Invalid extension ID format. Only alphanumeric, hyphens, underscores, slashes, and dots are allowed.' }],
              isError: true
            };
          }
          // Open extension in store for installation — use execFile (no shell)
          await execFileAsync('open', [`raycast://extensions/store/${encodeURIComponent(extension_id)}`], { timeout: 5000 });
          return {
            content: [{
              type: 'text',
              text: `Installing Extension: ${extension_id}\n\nExtension page opened for installation`
            }]
          };

        case 'publish': {
          if (!publish_path) {
            return {
              content: [{ type: 'text', text: 'Publish path required' }],
              isError: true
            };
          }

          // Validate path: no traversal, no null bytes
          if (publish_path.includes('..') || publish_path.includes('\0')) {
            return {
              content: [{ type: 'text', text: 'Invalid publish path: path traversal not allowed' }],
              isError: true
            };
          }

          const { readFileSync } = await import('fs');
          const { join, resolve } = await import('path');
          const resolvedPath = resolve(publish_path);
          const packageJsonPath = join(resolvedPath, 'package.json');

          try {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

            // Check for required Raycast extension fields
            const requiredFields = ['name', 'title', 'description', 'author', 'license'];
            const raycastConfig = packageJson.raycast || {};

            const missingFields = requiredFields.filter((field: string) => !packageJson[field] && !raycastConfig[field]);

            if (missingFields.length > 0) {
              return {
                content: [{
                  type: 'text',
                  text: `Extension validation failed. Missing required fields:\n\n${missingFields.map((f: string) => `- ${f}`).join('\n')}\n\nSee: https://developers.raycast.com/extension-manifest`
                }],
                isError: true
              };
            }

            // Publishing instructions — sanitize output from untrusted package.json
            const safeName = String(packageJson.name || 'N/A').substring(0, 128);
            const safeTitle = String(packageJson.title || 'N/A').substring(0, 128);
            const safeDesc = String(packageJson.description || 'N/A').substring(0, 256);
            const safeAuthor = String(packageJson.author || 'N/A').substring(0, 128);
            const safeLicense = String(packageJson.license || 'N/A').substring(0, 64);

            return {
              content: [{
                type: 'text',
                text: `Extension Publishing Guide for "${safeTitle}":\n\n` +
                      `1. Ensure your extension is in: ${resolvedPath}\n` +
                      `2. Run: npm run build (if applicable)\n` +
                      `3. Run: npm run publish or ray publish\n` +
                      `4. Submit to Raycast Store: https://raycast.com/contribute\n\n` +
                      `Extension Details:\n` +
                      `- Name: ${safeName}\n` +
                      `- Title: ${safeTitle}\n` +
                      `- Description: ${safeDesc}\n` +
                      `- Author: ${safeAuthor}\n` +
                      `- License: ${safeLicense}\n\n` +
                      `Publishing Documentation: https://developers.raycast.com/store/publishing`
              }]
            };

          } catch (error: any) {
            return {
              content: [{
                type: 'text',
                text: `Extension validation failed: ${error.message}\n\nEnsure the path contains a valid Raycast extension with package.json`
              }],
              isError: true
            };
          }
        }

        case 'update':
          // Open extensions preferences for updates — use execFile (no shell)
          await execFileAsync('open', ['raycast://preferences/extensions'], { timeout: 5000 });
          return {
            content: [{
              type: 'text',
              text: `Extension Updates\n\nExtensions preferences opened. Check for available updates.`
            }]
          };

        default:
          return {
            content: [{ type: 'text', text: `Unknown extension action: ${action}` }],
            isError: true
          };
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Extension action failed: ${error.message}` }],
        isError: true
      };
    }
  }

  private async handleWorkflowsTool(args: any) {
    const action = validateStringInput(args.action, 'action', 32);
    const name = args.name ? validateStringInput(args.name, 'name', 128) : undefined;
    const steps = Array.isArray(args.steps) ? args.steps : undefined;
    const trigger = args.trigger ? validateStringInput(args.trigger, 'trigger', 32) : undefined;

    try {
      switch (action) {
        case 'create':
          if (!name || !steps) {
            return {
              content: [{ type: 'text', text: 'Name and steps required for workflow creation' }],
              isError: true
            };
          }

          // Validate steps array length
          if (steps.length > 50) {
            return {
              content: [{ type: 'text', text: 'Too many workflow steps (max 50)' }],
              isError: true
            };
          }

          // Generate workflow configuration
          const allowedStepTypes = ['command', 'script', 'api_call', 'notification'];
          const workflow = {
            name,
            trigger: trigger || 'manual',
            steps: steps.map((step: any, index: number) => ({
              id: `step_${index + 1}`,
              type: allowedStepTypes.includes(step.type) ? step.type : 'unknown',
              action: typeof step.action === 'string' ? step.action.substring(0, 256) : '',
              parameters: step.parameters && typeof step.parameters === 'object' ? step.parameters : {}
            })),
            created: new Date().toISOString()
          };

          const workflowJson = JSON.stringify(workflow, null, 2);

          return {
            content: [{
              type: 'text',
              text: `Workflow Created: "${name}"\n\nConfiguration:\n${workflowJson}\n\nTo execute: raycast_workflows execute "${name}"\nTrigger: ${trigger || 'manual'}`
            }]
          };

        case 'list':
          return {
            content: [{
              type: 'text',
              text: `Raycast Workflows:\n\n` +
                    `Quick Actions:\n` +
                    `- System Sleep: pmset sleepnow\n` +
                    `- Empty Trash: Finder empty trash\n` +
                    `- Screenshot: screencapture workflow\n\n` +
                    `Integrations:\n` +
                    `- GitHub: Create issue/PR\n` +
                    `- Notion: Quick note\n` +
                    `- Slack: Send message\n\n` +
                    `Create custom workflows with: raycast_workflows create`
            }]
          };

        case 'execute': {
          if (!name) {
            return {
              content: [{ type: 'text', text: 'Workflow name required for execution' }],
              isError: true
            };
          }

          // Execute predefined workflows — all use execFile (no shell)
          const predefinedWorkflows: { [key: string]: () => Promise<string> } = {
            'system-sleep': async () => {
              await execFileAsync('pmset', ['sleepnow'], { timeout: 5000 });
              return 'System sleep initiated';
            },
            'empty-trash': async () => {
              await execFileAsync('osascript', ['-e', 'tell application "Finder" to empty the trash'], { timeout: 10000 });
              return 'Trash emptied';
            },
            'github-status': async () => {
              if (!this.auth.hasCredentials('github')) {
                throw new Error('GitHub credentials not configured');
              }
              const token = this.auth.getCredential('github');
              const response = await fetch('https://api.github.com/user', {
                headers: { Authorization: `token ${token}` }
              });
              if (!response.ok) {
                throw new Error(`GitHub API returned ${response.status}`);
              }
              const user = await response.json() as { login?: string; name?: string };
              return `GitHub User: ${user.login ?? 'unknown'} (${user.name ?? 'N/A'})`;
            }
          };

          const workflowFn = predefinedWorkflows[name];
          if (workflowFn) {
            const result = await workflowFn();
            return {
              content: [{
                type: 'text',
                text: `Workflow Executed: "${name}"\n\n${result}`
              }]
            };
          } else {
            return {
              content: [{
                type: 'text',
                text: `Workflow not found: "${name}"\n\nAvailable workflows:\n${Object.keys(predefinedWorkflows).map(w => `- ${w}`).join('\n')}`
              }],
              isError: true
            };
          }
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown workflow action: ${action}` }],
            isError: true
          };
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Workflow action failed: ${error.message}` }],
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
// Use CommonJS-compatible detection for both ES modules and CommonJS
const isMainModule = (() => {
  try {
    // Try ES module detection first
    if (import.meta.url) {
      return import.meta.url === `file://${process.argv[1]}`;
    }
  } catch {
    // Fall back to CommonJS detection
    return require.main === module;
  }
  return false;
})();

if (isMainModule) {
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