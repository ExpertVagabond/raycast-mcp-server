import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export const tools = {
    raycast_search: {
        name: 'raycast_search',
        description: 'Search and launch applications, files, or commands via Raycast',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query for Raycast'
                },
                execute: {
                    type: 'boolean',
                    default: false,
                    description: 'Execute the first result automatically'
                }
            },
            required: ['query']
        }
    },
    raycast_open: {
        name: 'raycast_open',
        description: 'Open specific Raycast commands or extensions',
        inputSchema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'Raycast command to open (e.g., "clipboard-history", "emoji", "calculator")'
                },
                extension: {
                    type: 'string',
                    description: 'Extension name to open'
                },
                args: {
                    type: 'string',
                    description: 'Additional arguments for the command'
                }
            }
        }
    },
    raycast_clipboard: {
        name: 'raycast_clipboard',
        description: 'Manage clipboard history via Raycast',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['show', 'clear', 'copy', 'paste'],
                    description: 'Clipboard action to perform'
                },
                text: {
                    type: 'string',
                    description: 'Text to copy (for copy action)'
                },
                index: {
                    type: 'number',
                    description: 'Clipboard history index to paste (for paste action)'
                }
            },
            required: ['action']
        }
    },
    raycast_shortcut: {
        name: 'raycast_shortcut',
        description: 'Trigger Raycast shortcuts and hotkeys',
        inputSchema: {
            type: 'object',
            properties: {
                shortcut: {
                    type: 'string',
                    enum: ['main-window', 'clipboard-history', 'emoji', 'calculator', 'screenshot', 'timer'],
                    description: 'Predefined Raycast shortcut to trigger'
                },
                custom_key: {
                    type: 'string',
                    description: 'Custom keyboard shortcut (e.g., "cmd+shift+c")'
                }
            }
        }
    },
    raycast_window: {
        name: 'raycast_window',
        description: 'Control Raycast window behavior',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['show', 'hide', 'toggle', 'focus'],
                    description: 'Window action to perform'
                }
            },
            required: ['action']
        }
    },
    raycast_system: {
        name: 'raycast_system',
        description: 'Access system functions through Raycast',
        inputSchema: {
            type: 'object',
            properties: {
                function: {
                    type: 'string',
                    enum: ['sleep', 'restart', 'shutdown', 'lock', 'logout', 'empty-trash', 'eject-all'],
                    description: 'System function to execute'
                },
                confirm: {
                    type: 'boolean',
                    default: true,
                    description: 'Show confirmation dialog for destructive actions'
                }
            },
            required: ['function']
        }
    }
};
export async function executeRaycastCommand(command) {
    try {
        const result = await execAsync(command, { timeout: 60000 }); // Increased timeout for AppleScript operations
        return { stdout: result.stdout, stderr: result.stderr };
    }
    catch (error) {
        if (error.code === 'ETIMEDOUT') {
            return {
                stdout: '',
                stderr: `Raycast operation timed out. This may be normal for complex AppleScript operations. Operation was attempted but may need manual verification.`
            };
        }
        return {
            stdout: '',
            stderr: error.message || 'Raycast command execution failed'
        };
    }
}
export async function openRaycast() {
    await execAsync('open -a Raycast');
}
export async function triggerRaycastURL(url) {
    await execAsync(`open "${url}"`);
}
//# sourceMappingURL=tools.js.map