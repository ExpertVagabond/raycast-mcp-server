import { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { executeRaycastCommand, openRaycast, triggerRaycastURL } from './tools.js';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Run a command with stdin input safely (no shell interpolation).
 * Used for passing AppleScript via stdin to osascript.
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

/**
 * Escape a string for safe inclusion in AppleScript string literals.
 * Prevents injection via quotes and backslashes.
 */
function escapeAppleScript(str: string): string {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/**
 * Validate and constrain string input length.
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

export async function handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
  try {
    switch (request.params.name) {
      case 'raycast_search':
        return await handleRaycastSearch(request.params.arguments as any);
      
      case 'raycast_open':
        return await handleRaycastOpen(request.params.arguments as any);
      
      case 'raycast_clipboard':
        return await handleRaycastClipboard(request.params.arguments as any);
      
      case 'raycast_shortcut':
        return await handleRaycastShortcut(request.params.arguments as any);
      
      case 'raycast_window':
        return await handleRaycastWindow(request.params.arguments as any);
      
      case 'raycast_system':
        return await handleRaycastSystem(request.params.arguments as any);
      
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
          isError: true
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error executing ${request.params.name}: ${error.message}` }],
      isError: true
    };
  }
}

async function handleRaycastSearch(args: any): Promise<CallToolResult> {
  const query = validateStringInput(args.query, 'query', 512);
  const execute = !!args.execute;

  try {
    // Open Raycast with search query
    const raycastURL = `raycast://script-commands/search?query=${encodeURIComponent(query)}`;
    await triggerRaycastURL(raycastURL);

    // Use AppleScript to interact with Raycast — escape user input to prevent injection
    const safeQuery = escapeAppleScript(query);
    const appleScript = `
      tell application "Raycast"
        activate
        delay 0.5
      end tell

      tell application "System Events"
        keystroke "${safeQuery}"
        ${execute ? 'delay 0.5\nkey code 36' : ''}
      end tell
    `;

    // Pass AppleScript via stdin to avoid shell escaping issues
    await spawnWithInput('osascript', ['-'], appleScript, 10000);

    return {
      content: [{
        type: 'text',
        text: `Raycast Search: "${query}"${execute ? ' (executed first result)' : ''}\n\nRaycast opened with search query`
      }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Raycast search failed: ${error.message}` }],
      isError: true
    };
  }
}

async function handleRaycastOpen(args: any): Promise<CallToolResult> {
  const command = args.command ? validateStringInput(args.command, 'command', 128) : undefined;
  const extension = args.extension ? validateStringInput(args.extension, 'extension', 128) : undefined;
  const cmdArgs = args.args ? validateStringInput(args.args, 'args', 512) : undefined;

  // Validate format: only allow alphanumeric, hyphens, underscores, slashes, dots
  const safeIdPattern = /^[a-zA-Z0-9\-_./]+$/;

  try {
    let raycastURL = 'raycast://';

    if (command) {
      // Common Raycast commands
      const commandMap: { [key: string]: string } = {
        'clipboard-history': 'extensions/raycast/clipboard-history/clipboard-history',
        'emoji': 'extensions/raycast/emoji-symbols/emoji-symbols',
        'calculator': 'extensions/raycast/calculator/calculator',
        'calendar': 'extensions/raycast/calendar/my-schedule',
        'contacts': 'extensions/raycast/contacts/search-contacts',
        'reminders': 'extensions/raycast/apple-reminders/create-reminder',
        'notes': 'extensions/raycast/apple-notes/search-notes',
        'safari-bookmarks': 'extensions/raycast/safari/search-bookmarks'
      };

      const mappedCommand = commandMap[command];
      if (mappedCommand) {
        raycastURL += mappedCommand;
      } else {
        // Validate unmapped commands to prevent URL injection
        if (!safeIdPattern.test(command)) {
          return {
            content: [{ type: 'text', text: `Invalid command format: "${command}"` }],
            isError: true
          };
        }
        raycastURL += `extensions/${command}`;
      }

      if (cmdArgs) {
        raycastURL += `?arguments=${encodeURIComponent(cmdArgs)}`;
      }
    } else if (extension) {
      if (!safeIdPattern.test(extension)) {
        return {
          content: [{ type: 'text', text: `Invalid extension format: "${extension}"` }],
          isError: true
        };
      }
      raycastURL += `extensions/${extension}`;
    } else {
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
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `❌ Raycast command failed: ${error.message}` }],
      isError: true
    };
  }
}

async function handleRaycastClipboard(args: any): Promise<CallToolResult> {
  const action = validateStringInput(args.action, 'action', 32);

  try {
    switch (action) {
      case 'show':
        await triggerRaycastURL('raycast://extensions/raycast/clipboard-history/clipboard-history');
        break;

      case 'clear': {
        // Use AppleScript via stdin — no shell interpolation
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
        await spawnWithInput('osascript', ['-'], clearScript, 15000);
        break;
      }

      case 'copy': {
        const copyText = validateStringInput(args.text, 'text', 100000);
        if (!copyText) {
          return {
            content: [{ type: 'text', text: 'Text is required for copy action' }],
            isError: true
          };
        }
        // Use execFile with pbcopy via stdin — no shell interpolation
        await spawnWithInput('pbcopy', [], copyText, 5000);
        break;
      }

      case 'paste': {
        const index = args.index;
        if (index !== undefined) {
          const safeIndex = Math.min(Math.max(0, parseInt(String(index), 10) || 0), 100);
          await triggerRaycastURL('raycast://extensions/raycast/clipboard-history/clipboard-history');
          const pasteScript = `tell application "System Events" to key code 125 repeat ${safeIndex} times`;
          await execFileAsync('osascript', ['-e', pasteScript], { timeout: 10000 });
          await execFileAsync('osascript', ['-e', 'tell application "System Events" to key code 36'], { timeout: 5000 });
        } else {
          await execFileAsync('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'], { timeout: 5000 });
        }
        break;
      }
    }

    return {
      content: [{
        type: 'text',
        text: `Clipboard ${action.toUpperCase()}${args.text ? `: "${String(args.text).substring(0, 100)}"` : ''}${args.index !== undefined ? ` (item ${args.index})` : ''}\n\nAction completed successfully`
      }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Clipboard action failed: ${error.message}` }],
      isError: true
    };
  }
}

async function handleRaycastShortcut(args: any): Promise<CallToolResult> {
  const shortcut = args.shortcut ? validateStringInput(args.shortcut, 'shortcut', 64) : undefined;
  const custom_key = args.custom_key ? validateStringInput(args.custom_key, 'custom_key', 64) : undefined;

  try {
    if (custom_key) {
      // Parse and execute custom keyboard shortcut
      const allowedModifiers = ['cmd', 'shift', 'alt', 'ctrl'];
      const allowedKeys = /^[a-z0-9]$/;
      const keys = custom_key.toLowerCase().split('+').map((k: string) => k.trim());
      const modifiers = keys.filter((k: string) => allowedModifiers.includes(k));
      const key = keys.find((k: string) => !allowedModifiers.includes(k));

      // Validate the key is a single alphanumeric character
      if (!key || !allowedKeys.test(key)) {
        return {
          content: [{ type: 'text', text: `Invalid key: "${key}". Must be a single alphanumeric character.` }],
          isError: true
        };
      }

      let modifierString = '';
      if (modifiers.includes('cmd')) modifierString += 'command down, ';
      if (modifiers.includes('shift')) modifierString += 'shift down, ';
      if (modifiers.includes('alt')) modifierString += 'option down, ';
      if (modifiers.includes('ctrl')) modifierString += 'control down, ';

      modifierString = modifierString.slice(0, -2); // Remove trailing comma

      const shortcutScript = `tell application "System Events" to keystroke "${key}" using {${modifierString}}`;
      await execFileAsync('osascript', ['-e', shortcutScript], { timeout: 5000 });
    } else if (shortcut) {
      // Predefined shortcuts
      const shortcuts: { [key: string]: string } = {
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
      } else {
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
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `❌ Shortcut execution failed: ${error.message}` }],
      isError: true
    };
  }
}

async function handleRaycastWindow(args: any): Promise<CallToolResult> {
  const action = validateStringInput(args.action, 'action', 32);

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
    
    await spawnWithInput('osascript', ['-'], windowScript);
    
    return {
      content: [{
        type: 'text',
        text: `🪟 Window ${action.toUpperCase()}\n\n✅ Window action completed successfully`
      }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `❌ Window action failed: ${error.message}` }],
      isError: true
    };
  }
}

async function handleRaycastSystem(args: any): Promise<CallToolResult> {
  const func = validateStringInput(args.function, 'function', 32);
  const confirmFlag = args.confirm !== false;

  // Whitelist of allowed system functions — no user input reaches the shell
  const allowedFunctions = ['sleep', 'restart', 'shutdown', 'lock', 'logout', 'empty-trash', 'eject-all'];
  if (!allowedFunctions.includes(func)) {
    return {
      content: [{ type: 'text', text: `Unknown system function: ${func}` }],
      isError: true
    };
  }

  try {
    // Show confirmation for destructive actions
    if (confirmFlag && ['restart', 'shutdown', 'logout', 'empty-trash'].includes(func)) {
      const safeFunc = escapeAppleScript(func);
      const confirmScript = `
        tell application "System Events"
          display dialog "Are you sure you want to ${safeFunc}?" buttons {"Cancel", "OK"} default button "Cancel"
          if button returned of result is "OK" then
            return "confirmed"
          else
            return "cancelled"
          end if
        end tell
      `;

      const confirmResult = await spawnWithInput('osascript', ['-'], confirmScript, 30000);
      if (String(confirmResult.stdout).trim() !== 'confirmed') {
        return {
          content: [{ type: 'text', text: `System ${func} cancelled by user` }]
        };
      }
    }

    // Execute system commands using execFile (no shell) where possible
    switch (func) {
      case 'sleep':
        await execFileAsync('pmset', ['sleepnow'], { timeout: 5000 });
        break;
      case 'restart':
        await execFileAsync('sudo', ['shutdown', '-r', 'now'], { timeout: 5000 });
        break;
      case 'shutdown':
        await execFileAsync('sudo', ['shutdown', '-h', 'now'], { timeout: 5000 });
        break;
      case 'lock':
        await execFileAsync('/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession', ['-suspend'], { timeout: 5000 });
        break;
      case 'logout':
        await execFileAsync('osascript', ['-e', 'tell application "System Events" to log out'], { timeout: 5000 });
        break;
      case 'empty-trash':
        await execFileAsync('osascript', ['-e', 'tell application "Finder" to empty the trash'], { timeout: 10000 });
        break;
      case 'eject-all':
        await execFileAsync('osascript', ['-e', 'tell application "Finder" to eject the disks'], { timeout: 10000 });
        break;
    }

    return {
      content: [{
        type: 'text',
        text: `System ${func.toUpperCase()}\n\nSystem function executed successfully`
      }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `System function failed: ${error.message}` }],
      isError: true
    };
  }
}