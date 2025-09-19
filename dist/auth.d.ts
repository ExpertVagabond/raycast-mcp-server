export interface AuthConfig {
    raycastApiKey?: string;
    raycastTeamId?: string;
    githubToken?: string;
    notionToken?: string;
    figmaToken?: string;
    slackToken?: string;
    linearToken?: string;
    jiraToken?: string;
}
export declare class RaycastAuth {
    private config;
    constructor(config?: AuthConfig);
    initiateOAuth(service: string): Promise<string>;
    hasCredentials(service: string): boolean;
    getCredential(service: string): string | undefined;
    validateCredentials(service: string): Promise<{
        valid: boolean;
        user?: any;
        error?: string;
    }>;
    getSetupInstructions(service: string): string;
    auditIntegrations(): Promise<string>;
}
export declare const raycastAuth: RaycastAuth;
//# sourceMappingURL=auth.d.ts.map