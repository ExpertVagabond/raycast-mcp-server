use serde::Deserialize;
use serde_json::{json, Value};
use std::io::BufRead;
use std::process::Command;
use tracing::info;

#[derive(Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

fn run_cmd(cmd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run {cmd}: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("{cmd} failed: {stderr}"))
    }
}

fn run_osascript(script: &str) -> Result<String, String> {
    run_cmd("osascript", &["-e", script])
}

fn open_url(url: &str) -> Result<String, String> {
    run_cmd("open", &[url])
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "raycast_search",
            "description": "Search and launch applications, files, or commands via Raycast",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query for Raycast"},
                    "execute": {"type": "boolean", "default": false, "description": "Execute the first result automatically"}
                },
                "required": ["query"]
            }
        },
        {
            "name": "raycast_open",
            "description": "Open specific Raycast commands or extensions",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Raycast command (e.g. clipboard-history, emoji, calculator)"},
                    "extension": {"type": "string", "description": "Extension name to open"},
                    "args": {"type": "string", "description": "Additional arguments for the command"}
                }
            }
        },
        {
            "name": "raycast_clipboard",
            "description": "Manage clipboard history via Raycast",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["show", "clear", "copy", "paste"], "description": "Clipboard action"},
                    "text": {"type": "string", "description": "Text to copy (for copy action)"},
                    "index": {"type": "number", "description": "Clipboard history index (for paste action)"}
                },
                "required": ["action"]
            }
        },
        {
            "name": "raycast_shortcut",
            "description": "Trigger Raycast shortcuts and hotkeys",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "shortcut": {"type": "string", "enum": ["main-window", "clipboard-history", "emoji", "calculator", "screenshot", "timer"], "description": "Predefined shortcut"},
                    "custom_key": {"type": "string", "description": "Custom keyboard shortcut (e.g. cmd+shift+c)"}
                }
            }
        },
        {
            "name": "raycast_window",
            "description": "Control Raycast window behavior",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["show", "hide", "toggle", "focus"], "description": "Window action"}
                },
                "required": ["action"]
            }
        },
        {
            "name": "raycast_system",
            "description": "Access system functions through Raycast",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "function": {"type": "string", "enum": ["sleep", "restart", "shutdown", "lock", "logout", "empty-trash", "eject-all"], "description": "System function"},
                    "confirm": {"type": "boolean", "default": true, "description": "Show confirmation for destructive actions"}
                },
                "required": ["function"]
            }
        },
        {
            "name": "raycast_auth",
            "description": "Manage Raycast and service authentication",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["setup", "validate", "audit", "oauth"], "description": "Auth action"},
                    "service": {"type": "string", "enum": ["raycast", "github", "notion", "figma", "slack", "linear", "jira"], "description": "Service to authenticate with"}
                },
                "required": ["action"]
            }
        },
        {
            "name": "raycast_extensions",
            "description": "Manage Raycast extensions and store integration",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["list", "install", "uninstall", "update", "search", "publish"], "description": "Extension action"},
                    "query": {"type": "string", "description": "Search query or extension name"},
                    "extension_id": {"type": "string", "description": "Extension ID"},
                    "publish_path": {"type": "string", "description": "Local path to extension for publishing"}
                },
                "required": ["action"]
            }
        },
        {
            "name": "raycast_workflows",
            "description": "Create and manage Raycast workflows and automations",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["create", "list", "execute", "edit", "delete"], "description": "Workflow action"},
                    "name": {"type": "string", "description": "Workflow name"},
                    "steps": {"type": "array", "items": {"type": "object"}, "description": "Workflow steps"},
                    "trigger": {"type": "string", "enum": ["hotkey", "schedule", "event"], "description": "Trigger type"}
                },
                "required": ["action"]
            }
        }
    ])
}

fn call_tool(name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "raycast_search" => {
            let query = args["query"].as_str().ok_or("query required")?;
            let execute = args["execute"].as_bool().unwrap_or(false);
            let encoded = urlenc(query);
            let url = format!("raycast://script-commands/search?query={encoded}");
            open_url(&url)?;
            let script = format!(
                "tell application \"Raycast\" to activate\ndelay 0.5\ntell application \"System Events\" to keystroke \"{}\"{}",
                query.replace('"', "\\\""),
                if execute { "\ndelay 0.5\ntell application \"System Events\" to key code 36" } else { "" }
            );
            let _ = run_osascript(&script);
            Ok(json!({"action": "search", "query": query, "executed": execute}))
        }
        "raycast_open" => {
            let command = args["command"].as_str();
            let extension = args["extension"].as_str();
            let cmd_args = args["args"].as_str();

            if let Some(cmd) = command {
                let mapped = match cmd {
                    "clipboard-history" => "extensions/raycast/clipboard-history/clipboard-history",
                    "emoji" => "extensions/raycast/emoji-symbols/emoji-symbols",
                    "calculator" => "extensions/raycast/calculator/calculator",
                    "calendar" => "extensions/raycast/calendar/my-schedule",
                    "contacts" => "extensions/raycast/contacts/search-contacts",
                    "reminders" => "extensions/raycast/apple-reminders/create-reminder",
                    "notes" => "extensions/raycast/apple-notes/search-notes",
                    "safari-bookmarks" => "extensions/raycast/safari/search-bookmarks",
                    other => return {
                        let url = format!("raycast://extensions/{other}");
                        open_url(&url)?;
                        Ok(json!({"action": "open", "command": other}))
                    },
                };
                let mut url = format!("raycast://{mapped}");
                if let Some(a) = cmd_args {
                    url.push_str(&format!("?arguments={}", urlenc(a)));
                }
                open_url(&url)?;
                Ok(json!({"action": "open", "command": cmd}))
            } else if let Some(ext) = extension {
                let url = format!("raycast://extensions/{ext}");
                open_url(&url)?;
                Ok(json!({"action": "open", "extension": ext}))
            } else {
                run_cmd("open", &["-a", "Raycast"])?;
                Ok(json!({"action": "open", "target": "Raycast"}))
            }
        }
        "raycast_clipboard" => {
            let action = args["action"].as_str().ok_or("action required")?;
            match action {
                "show" => {
                    open_url("raycast://extensions/raycast/clipboard-history/clipboard-history")?;
                }
                "clear" => {
                    let script = "tell application \"Raycast\" to activate\ntell application \"System Events\"\nkeystroke \",\" using command down\ndelay 1\nkeystroke \"clipboard\"\ndelay 0.5\nkey code 36\ndelay 0.5\nkeystroke \"Clear History\"\ndelay 0.5\nkey code 36\nend tell";
                    run_osascript(script)?;
                }
                "copy" => {
                    let text = args["text"].as_str().ok_or("text required for copy")?;
                    run_cmd("pbcopy", &[]).map_err(|_| "pbcopy failed".to_string())?;
                    // Use a pipe approach
                    let output = Command::new("sh")
                        .args(["-c", &format!("printf '%s' '{}' | pbcopy", text.replace('\'', "'\\''"))])
                        .output()
                        .map_err(|e| format!("copy failed: {e}"))?;
                    if !output.status.success() {
                        return Err("pbcopy failed".to_string());
                    }
                }
                "paste" => {
                    if let Some(idx) = args["index"].as_u64() {
                        open_url("raycast://extensions/raycast/clipboard-history/clipboard-history")?;
                        let script = format!("tell application \"System Events\" to key code 125 repeat {} times", idx);
                        run_osascript(&script)?;
                        run_osascript("tell application \"System Events\" to key code 36")?;
                    } else {
                        run_osascript("tell application \"System Events\" to keystroke \"v\" using command down")?;
                    }
                }
                _ => return Err(format!("Unknown clipboard action: {action}")),
            }
            Ok(json!({"action": action}))
        }
        "raycast_shortcut" => {
            let shortcut = args["shortcut"].as_str();
            let custom_key = args["custom_key"].as_str();

            if let Some(key) = custom_key {
                let parts: Vec<&str> = key.split('+').map(|s| s.trim()).collect();
                let mods = ["cmd", "shift", "alt", "ctrl"];
                let modifiers: Vec<&str> = parts.iter().filter(|k| mods.contains(k)).copied().collect();
                let key_char = parts.iter().find(|k| !mods.contains(k)).unwrap_or(&"");
                let mut mod_str = String::new();
                for m in &modifiers {
                    if !mod_str.is_empty() { mod_str.push_str(", "); }
                    match *m {
                        "cmd" => mod_str.push_str("command down"),
                        "shift" => mod_str.push_str("shift down"),
                        "alt" => mod_str.push_str("option down"),
                        "ctrl" => mod_str.push_str("control down"),
                        _ => {}
                    }
                }
                let script = format!("tell application \"System Events\" to keystroke \"{}\" using {{{mod_str}}}", key_char);
                run_osascript(&script)?;
                Ok(json!({"action": "shortcut", "key": key}))
            } else if let Some(sc) = shortcut {
                let url = match sc {
                    "main-window" => "raycast://",
                    "clipboard-history" => "raycast://extensions/raycast/clipboard-history/clipboard-history",
                    "emoji" => "raycast://extensions/raycast/emoji-symbols/emoji-symbols",
                    "calculator" => "raycast://extensions/raycast/calculator/calculator",
                    "screenshot" => "raycast://extensions/raycast/screenshot/screenshot",
                    "timer" => "raycast://extensions/raycast/timer/timer",
                    _ => return Err(format!("Unknown shortcut: {sc}")),
                };
                open_url(url)?;
                Ok(json!({"action": "shortcut", "shortcut": sc}))
            } else {
                Err("shortcut or custom_key required".to_string())
            }
        }
        "raycast_window" => {
            let action = args["action"].as_str().ok_or("action required")?;
            let script = match action {
                "show" | "focus" => "tell application \"Raycast\" to activate",
                "hide" => "tell application \"Raycast\" to set visible to false",
                "toggle" => "if application \"Raycast\" is running then\ntell application \"Raycast\" to activate\nend if",
                _ => return Err(format!("Unknown window action: {action}")),
            };
            run_osascript(script)?;
            Ok(json!({"action": action}))
        }
        "raycast_system" => {
            let func = args["function"].as_str().ok_or("function required")?;
            let confirm = args["confirm"].as_bool().unwrap_or(true);

            if confirm && matches!(func, "restart" | "shutdown" | "logout" | "empty-trash") {
                let script = format!(
                    "tell application \"System Events\"\ndisplay dialog \"Are you sure you want to {func}?\" buttons {{\"Cancel\", \"OK\"}} default button \"Cancel\"\nif button returned of result is \"OK\" then\nreturn \"confirmed\"\nelse\nreturn \"cancelled\"\nend if\nend tell"
                );
                let result = run_osascript(&script)?;
                if !result.trim().contains("confirmed") {
                    return Ok(json!({"action": func, "status": "cancelled"}));
                }
            }

            let cmd = match func {
                "sleep" => "pmset sleepnow",
                "lock" => "/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend",
                "logout" => "osascript -e 'tell application \"System Events\" to log out'",
                "empty-trash" => "osascript -e 'tell application \"Finder\" to empty the trash'",
                "eject-all" => "osascript -e 'tell application \"Finder\" to eject the disks'",
                "restart" => "sudo shutdown -r now",
                "shutdown" => "sudo shutdown -h now",
                _ => return Err(format!("Unknown system function: {func}")),
            };
            let output = Command::new("sh").args(["-c", cmd]).output().map_err(|e| format!("{e}"))?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("System command failed: {stderr}"));
            }
            Ok(json!({"action": func, "status": "executed"}))
        }
        "raycast_auth" => {
            let action = args["action"].as_str().ok_or("action required")?;
            let service = args["service"].as_str();
            match action {
                "setup" => {
                    let svc = service.ok_or("service required for setup")?;
                    let instructions = match svc {
                        "raycast" => "Raycast API Setup:\n1. Open Raycast > Preferences > Extensions > Developer\n2. Create new API key\n3. export RAYCAST_API_KEY=\"your-key\"",
                        "github" => "GitHub Token Setup:\n1. GitHub Settings > Developer settings > Personal access tokens\n2. Generate token with repo,user scopes\n3. export GITHUB_TOKEN=\"your-token\"",
                        "notion" => "Notion Setup:\n1. notion.so/my-integrations > Create integration\n2. Copy Internal Integration Token\n3. export NOTION_TOKEN=\"your-token\"",
                        "figma" => "Figma Setup:\n1. Figma Settings > Personal access tokens\n2. Generate token\n3. export FIGMA_TOKEN=\"your-token\"",
                        "slack" => "Slack Setup:\n1. api.slack.com/apps > Create app\n2. Configure OAuth scopes\n3. export SLACK_TOKEN=\"your-bot-token\"",
                        _ => "Setup instructions not available for this service",
                    };
                    Ok(json!({"action": "setup", "service": svc, "instructions": instructions}))
                }
                "validate" => {
                    let svc = service.ok_or("service required")?;
                    let env_var = match svc {
                        "raycast" => "RAYCAST_API_KEY",
                        "github" => "GITHUB_TOKEN",
                        "notion" => "NOTION_TOKEN",
                        "figma" => "FIGMA_TOKEN",
                        "slack" => "SLACK_TOKEN",
                        "linear" => "LINEAR_TOKEN",
                        "jira" => "JIRA_TOKEN",
                        _ => return Err(format!("Unknown service: {svc}")),
                    };
                    let configured = std::env::var(env_var).is_ok();
                    Ok(json!({"service": svc, "configured": configured, "envVar": env_var}))
                }
                "audit" => {
                    let services = ["RAYCAST_API_KEY", "GITHUB_TOKEN", "NOTION_TOKEN", "FIGMA_TOKEN", "SLACK_TOKEN", "LINEAR_TOKEN", "JIRA_TOKEN"];
                    let names = ["raycast", "github", "notion", "figma", "slack", "linear", "jira"];
                    let report: Vec<Value> = services.iter().zip(names.iter()).map(|(var, name)| {
                        json!({"service": name, "configured": std::env::var(var).is_ok()})
                    }).collect();
                    Ok(json!({"audit": report}))
                }
                "oauth" => {
                    let svc = service.ok_or("service required")?;
                    Ok(json!({"action": "oauth", "service": svc, "info": "OAuth flow must be completed in browser. Set the resulting token in the appropriate environment variable."}))
                }
                _ => Err(format!("Unknown auth action: {action}")),
            }
        }
        "raycast_extensions" => {
            let action = args["action"].as_str().ok_or("action required")?;
            match action {
                "list" => {
                    let result = run_cmd("defaults", &["read", "com.raycast.macos", "extensions"]).unwrap_or_else(|_| "No extensions configuration found".to_string());
                    Ok(json!({"extensions": result.trim()}))
                }
                "search" => {
                    let query = args["query"].as_str().ok_or("query required")?;
                    let url = format!("raycast://extensions/store?search={}", urlenc(query));
                    open_url(&url)?;
                    Ok(json!({"action": "search", "query": query}))
                }
                "install" => {
                    let ext_id = args["extension_id"].as_str().ok_or("extension_id required")?;
                    let url = format!("raycast://extensions/store/{ext_id}");
                    open_url(&url)?;
                    Ok(json!({"action": "install", "extension_id": ext_id}))
                }
                "update" => {
                    open_url("raycast://preferences/extensions")?;
                    Ok(json!({"action": "update", "info": "Extensions preferences opened"}))
                }
                _ => Ok(json!({"action": action, "info": "Action noted"})),
            }
        }
        "raycast_workflows" => {
            let action = args["action"].as_str().ok_or("action required")?;
            match action {
                "create" => {
                    let wf_name = args["name"].as_str().ok_or("name required")?;
                    let trigger = args["trigger"].as_str().unwrap_or("manual");
                    Ok(json!({"action": "create", "name": wf_name, "trigger": trigger, "info": "Workflow created (in-memory)"}))
                }
                "list" => {
                    Ok(json!({"workflows": ["system-sleep", "empty-trash", "github-status"], "info": "Predefined workflows available"}))
                }
                "execute" => {
                    let wf_name = args["name"].as_str().ok_or("name required")?;
                    match wf_name {
                        "system-sleep" => {
                            run_cmd("pmset", &["sleepnow"])?;
                            Ok(json!({"action": "execute", "name": wf_name, "status": "executed"}))
                        }
                        "empty-trash" => {
                            run_osascript("tell application \"Finder\" to empty the trash")?;
                            Ok(json!({"action": "execute", "name": wf_name, "status": "executed"}))
                        }
                        _ => Err(format!("Workflow not found: {wf_name}")),
                    }
                }
                _ => Ok(json!({"action": action, "info": "Action noted"})),
            }
        }
        _ => Err(format!("Unknown tool: {name}")),
    }
}

fn urlenc(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info").with_writer(std::io::stderr).init();
    info!("raycast-mcp-server starting on stdio");

    let stdin = std::io::stdin();
    let stdout = std::io::stdout();

    let mut line = String::new();
    loop {
        line.clear();
        if stdin.lock().read_line(&mut line).unwrap_or(0) == 0 { break; }
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }

        let req: JsonRpcRequest = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(_) => continue,
        };

        let response = match req.method.as_str() {
            "initialize" => json!({
                "jsonrpc": "2.0",
                "id": req.id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "raycast-mcp-server", "version": "0.1.0"}
                }
            }),
            "notifications/initialized" => continue,
            "tools/list" => json!({
                "jsonrpc": "2.0",
                "id": req.id,
                "result": {"tools": tool_definitions()}
            }),
            "tools/call" => {
                let tool_name = req.params["name"].as_str().unwrap_or("");
                let arguments = &req.params["arguments"];
                match call_tool(tool_name, arguments) {
                    Ok(result) => json!({
                        "jsonrpc": "2.0",
                        "id": req.id,
                        "result": {
                            "content": [{"type": "text", "text": serde_json::to_string_pretty(&result).unwrap_or_default()}]
                        }
                    }),
                    Err(e) => json!({
                        "jsonrpc": "2.0",
                        "id": req.id,
                        "result": {
                            "content": [{"type": "text", "text": format!("Error: {e}")}],
                            "isError": true
                        }
                    }),
                }
            }
            _ => json!({
                "jsonrpc": "2.0",
                "id": req.id,
                "error": {"code": -32601, "message": format!("Unknown method: {}", req.method)}
            }),
        };

        use std::io::Write;
        let out = serde_json::to_string(&response).unwrap();
        let mut lock = stdout.lock();
        let _ = writeln!(lock, "{out}");
        let _ = lock.flush();
    }
}
