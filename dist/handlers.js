import { openRaycast, triggerRaycastURL } from './tools.js';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export async function handleToolCall(request) {
    try {
        switch (request.params.name) {
            case 'raycast_search':
                return await handleRaycastSearch(request.params.arguments);
            case 'raycast_open':
                return await handleRaycastOpen(request.params.arguments);
            case 'raycast_clipboard':
                return await handleRaycastClipboard(request.params.arguments);
            case 'raycast_shortcut':
                return await handleRaycastShortcut(request.params.arguments);
            case 'raycast_window':
                return await handleRaycastWindow(request.params.arguments);
            case 'raycast_system':
                return await handleRaycastSystem(request.params.arguments);
            default:
                return {
                    content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
                    isError: true
                };
        }
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error executing ${request.params.name}: ${error.message}` }],
            isError: true
        };
    }
}
async function handleRaycastSearch(args) {
    const { query, execute = false } = args;
    try {
        // Open Raycast with search query
        const raycastURL = `raycast://script-commands/search?query=${encodeURIComponent(query)}`;
        await triggerRaycastURL(raycastURL);
        // Alternative: Use AppleScript to interact with Raycast
        const appleScript = `
      tell application "Raycast"
        activate
        delay 0.5
      end tell
      
      tell application "System Events"
        keystroke "${query}"
        ${execute ? 'delay 0.5\nkey code 36' : ''}
      end tell
    `;
        await execAsync(`osascript -e '${appleScript}'`);
        return {
            content: [{
                    type: 'text',
                    text: `🔍 Raycast Search: "${query}"${execute ? ' (executed first result)' : ''}\n\n✅ Raycast opened with search query`
                }]
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `❌ Raycast search failed: ${error.message}` }],
            isError: true
        };
    }
}
async function handleRaycastOpen(args) {
    const { command, extension, args: cmdArgs } = args;
    try {
        let raycastURL = 'raycast://';
        if (command) {
            // Common Raycast commands
            const commandMap = {
                'clipboard-history': 'extensions/raycast/clipboard-history/clipboard-history',
                'emoji': 'extensions/raycast/emoji-symbols/emoji-symbols',
                'calculator': 'extensions/raycast/calculator/calculator',
                'calendar': 'extensions/raycast/calendar/my-schedule',
                'contacts': 'extensions/raycast/contacts/search-contacts',
                'reminders': 'extensions/raycast/apple-reminders/create-reminder',
                'notes': 'extensions/raycast/apple-notes/search-notes',
                'safari-bookmarks': 'extensions/raycast/safari/search-bookmarks'
            };
            const mappedCommand = commandMap[command] || `extensions/${command}`;
            raycastURL += mappedCommand;
            if (cmdArgs) {
                raycastURL += `?arguments=${encodeURIComponent(cmdArgs)}`;
            }
        }
        else if (extension) {
            raycastURL += `extensions/${extension}`;
        }
        else {
            await openRaycast();
            return {
                content: [{ type: 'text', text: '🚀 Raycast opened' }]
            };
        }
        await triggerRaycastURL(raycastURL);
        return {
            content: [{
                    type: 'text',
                    text: `🚀 Raycast Command: ${command || extension}\n\n✅ Command executed successfully`
                }]
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `❌ Raycast command failed: ${error.message}` }],
            isError: true
        };
    }
}
async function handleRaycastClipboard(args) {
    const { action, text, index } = args;
    try {
        switch (action) {
            case 'show':
                await triggerRaycastURL('raycast://extensions/raycast/clipboard-history/clipboard-history');
                break;
            case 'clear':
                // Use AppleScript to clear clipboard history
                const clearScript = `
          tell application "Raycast"
            activate
          end tell
          tell application "System Events"
            keystroke "," using command down
            delay 1
            keystroke "clipboard"
            delay 0.5
            key code 36
            delay 0.5
            keystroke "Clear History"
            delay 0.5
            key code 36
          end tell
        `;
                await execAsync(`osascript -e '${clearScript}'`);
                break;
            case 'copy':
                if (!text) {
                    return {
                        content: [{ type: 'text', text: '❌ Text is required for copy action' }],
                        isError: true
                    };
                }
                await execAsync(`echo "${text}" | pbcopy`);
                break;
            case 'paste':
                if (index !== undefined) {
                    // Open clipboard history and select item
                    await triggerRaycastURL('raycast://extensions/raycast/clipboard-history/clipboard-history');
                    await execAsync(`osascript -e 'tell application "System Events" to key code 125 repeat ${index} times'`);
                    await execAsync(`osascript -e 'tell application "System Events" to key code 36'`);
                }
                else {
                    await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
                }
                break;
        }
        return {
            content: [{
                    type: 'text',
                    text: `📋 Clipboard ${action.toUpperCase()}${text ? `: "${text}"` : ''}${index !== undefined ? ` (item ${index})` : ''}\n\n✅ Action completed successfully`
                }]
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `❌ Clipboard action failed: ${error.message}` }],
            isError: true
        };
    }
}
async function handleRaycastShortcut(args) {
    const { shortcut, custom_key } = args;
    try {
        if (custom_key) {
            // Parse and execute custom keyboard shortcut
            const keys = custom_key.toLowerCase().split('+').map((k) => k.trim());
            const modifiers = keys.filter((k) => ['cmd', 'shift', 'alt', 'ctrl'].includes(k));
            const key = keys.find((k) => !['cmd', 'shift', 'alt', 'ctrl'].includes(k));
            let modifierString = '';
            if (modifiers.includes('cmd'))
                modifierString += 'command down, ';
            if (modifiers.includes('shift'))
                modifierString += 'shift down, ';
            if (modifiers.includes('alt'))
                modifierString += 'option down, ';
            if (modifiers.includes('ctrl'))
                modifierString += 'control down, ';
            modifierString = modifierString.slice(0, -2); // Remove trailing comma
            const shortcutScript = `tell application "System Events" to keystroke "${key}" using {${modifierString}}`;
            await execAsync(`osascript -e '${shortcutScript}'`);
        }
        else if (shortcut) {
            // Predefined shortcuts
            const shortcuts = {
                'main-window': 'raycast://',
                'clipboard-history': 'raycast://extensions/raycast/clipboard-history/clipboard-history',
                'emoji': 'raycast://extensions/raycast/emoji-symbols/emoji-symbols',
                'calculator': 'raycast://extensions/raycast/calculator/calculator',
                'screenshot': 'raycast://extensions/raycast/screenshot/screenshot',
                'timer': 'raycast://extensions/raycast/timer/timer'
            };
            const url = shortcuts[shortcut];
            if (url) {
                await triggerRaycastURL(url);
            }
            else {
                return {
                    content: [{ type: 'text', text: `❌ Unknown shortcut: ${shortcut}` }],
                    isError: true
                };
            }
        }
        return {
            content: [{
                    type: 'text',
                    text: `⌨️ Shortcut Triggered: ${shortcut || custom_key}\n\n✅ Shortcut executed successfully`
                }]
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `❌ Shortcut execution failed: ${error.message}` }],
            isError: true
        };
    }
}
async function handleRaycastWindow(args) {
    const { action } = args;
    try {
        const windowScript = (() => {
            switch (action) {
                case 'show':
                    return 'tell application "Raycast" to activate';
                case 'hide':
                    return 'tell application "Raycast" to set visible to false';
                case 'toggle':
                    return `
            if application "Raycast" is running then
              tell application "System Events"
                if (name of processes) contains "Raycast" then
                  tell application "Raycast" to set visible to not visible
                else
                  tell application "Raycast" to activate
                end if
              end tell
            else
              tell application "Raycast" to activate
            end if
          `;
                case 'focus':
                    return 'tell application "Raycast" to activate';
                default:
                    throw new Error(`Unknown window action: ${action}`);
            }
        })();
        await execAsync(`osascript -e '${windowScript}'`);
        return {
            content: [{
                    type: 'text',
                    text: `🪟 Window ${action.toUpperCase()}\n\n✅ Window action completed successfully`
                }]
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `❌ Window action failed: ${error.message}` }],
            isError: true
        };
    }
}
async function handleRaycastSystem(args) {
    const { function: func, confirm = true } = args;
    try {
        const systemCommands = {
            'sleep': 'pmset sleepnow',
            'restart': 'sudo shutdown -r now',
            'shutdown': 'sudo shutdown -h now',
            'lock': '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend',
            'logout': 'osascript -e "tell application \\"System Events\\" to log out"',
            'empty-trash': 'osascript -e "tell application \\"Finder\\" to empty the trash"',
            'eject-all': 'osascript -e "tell application \\"Finder\\" to eject the disks"'
        };
        const command = systemCommands[func];
        if (!command) {
            return {
                content: [{ type: 'text', text: `❌ Unknown system function: ${func}` }],
                isError: true
            };
        }
        // Show confirmation for destructive actions
        if (confirm && ['restart', 'shutdown', 'logout', 'empty-trash'].includes(func)) {
            const confirmScript = `
        tell application "System Events"
          display dialog "Are you sure you want to ${func}?" buttons {"Cancel", "OK"} default button "Cancel"
          if button returned of result is "OK" then
            return "confirmed"
          else
            return "cancelled"
          end if
        end tell
      `;
            const confirmResult = await execAsync(`osascript -e '${confirmScript}'`);
            if (confirmResult.stdout.trim() !== 'confirmed') {
                return {
                    content: [{ type: 'text', text: `❌ System ${func} cancelled by user` }]
                };
            }
        }
        // Execute the system command
        await execAsync(command);
        return {
            content: [{
                    type: 'text',
                    text: `🔧 System ${func.toUpperCase()}\n\n✅ System function executed successfully`
                }]
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `❌ System function failed: ${error.message}` }],
            isError: true
        };
    }
}
//# sourceMappingURL=handlers.js.map