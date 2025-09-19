#!/usr/bin/env node
import { AuthConfig } from './auth.js';
declare class RaycastMCPServer {
    private server;
    private auth;
    constructor(authConfig?: AuthConfig);
    private setupHandlers;
    private handleAuthTool;
    private handleExtensionsTool;
    private handleWorkflowsTool;
    start(): Promise<void>;
}
export declare function createServer(config?: AuthConfig): RaycastMCPServer;
export default RaycastMCPServer;
//# sourceMappingURL=index.d.ts.map