import { Tool } from '@modelcontextprotocol/sdk/types.js';
export interface RaycastTools {
    raycast_search: Tool;
    raycast_open: Tool;
    raycast_clipboard: Tool;
    raycast_shortcut: Tool;
    raycast_window: Tool;
    raycast_system: Tool;
}
export declare const tools: RaycastTools;
export declare function executeRaycastCommand(command: string): Promise<{
    stdout: string;
    stderr: string;
}>;
export declare function openRaycast(): Promise<void>;
export declare function triggerRaycastURL(url: string): Promise<void>;
//# sourceMappingURL=tools.d.ts.map