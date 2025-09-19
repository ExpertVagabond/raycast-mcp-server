import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export class RaycastAuth {
    config;
    constructor(config = {}) {
        this.config = {
            raycastApiKey: config.raycastApiKey || process.env.RAYCAST_API_KEY,
            raycastTeamId: config.raycastTeamId || process.env.RAYCAST_TEAM_ID,
            githubToken: config.githubToken || process.env.GITHUB_TOKEN,
            notionToken: config.notionToken || process.env.NOTION_TOKEN,
            figmaToken: config.figmaToken || process.env.FIGMA_TOKEN,
            slackToken: config.slackToken || process.env.SLACK_TOKEN,
            linearToken: config.linearToken || process.env.LINEAR_TOKEN,
            jiraToken: config.jiraToken || process.env.JIRA_TOKEN,
            ...config
        };
    }
    // OAuth flow for Raycast extensions
    async initiateOAuth(service) {
        const oauthUrls = {
            github: 'https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&scope=repo,user',
            notion: 'https://api.notion.com/v1/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code',
            figma: 'https://www.figma.com/oauth?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT&scope=files:read',
            slack: 'https://slack.com/oauth/v2/authorize?client_id=YOUR_CLIENT_ID&scope=channels:read,chat:write',
            linear: 'https://linear.app/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code',
            jira: 'https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=YOUR_CLIENT_ID'
        };
        const url = oauthUrls[service];
        if (!url) {
            throw new Error(`Unsupported OAuth service: ${service}`);
        }
        // Open OAuth URL in browser
        await execAsync(`open "${url}"`);
        return url;
    }
    // Check if credentials are configured
    hasCredentials(service) {
        const serviceMap = {
            raycast: 'raycastApiKey',
            github: 'githubToken',
            notion: 'notionToken',
            figma: 'figmaToken',
            slack: 'slackToken',
            linear: 'linearToken',
            jira: 'jiraToken'
        };
        const key = serviceMap[service];
        return key ? !!this.config[key] : false;
    }
    // Get credential for service
    getCredential(service) {
        const serviceMap = {
            raycast: 'raycastApiKey',
            github: 'githubToken',
            notion: 'notionToken',
            figma: 'figmaToken',
            slack: 'slackToken',
            linear: 'linearToken',
            jira: 'jiraToken'
        };
        const key = serviceMap[service];
        return key ? this.config[key] : undefined;
    }
    // Validate API credentials
    async validateCredentials(service) {
        const token = this.getCredential(service);
        if (!token) {
            return { valid: false, error: 'No credentials found' };
        }
        try {
            const validators = {
                github: async () => {
                    const response = await fetch('https://api.github.com/user', {
                        headers: { Authorization: `token ${token}` }
                    });
                    return response.json();
                },
                notion: async () => {
                    const response = await fetch('https://api.notion.com/v1/users/me', {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Notion-Version': '2022-06-28'
                        }
                    });
                    return response.json();
                },
                figma: async () => {
                    const response = await fetch('https://api.figma.com/v1/me', {
                        headers: { 'X-Figma-Token': token }
                    });
                    return response.json();
                }
            };
            const validator = validators[service];
            if (!validator) {
                return { valid: false, error: 'Validation not implemented for this service' };
            }
            const user = await validator();
            return { valid: true, user };
        }
        catch (error) {
            return { valid: false, error: error.message };
        }
    }
    // Generate credential setup instructions
    getSetupInstructions(service) {
        const instructions = {
            raycast: `
🚀 Raycast API Setup:
1. Open Raycast → Preferences → Extensions → "Developer"
2. Create new API key
3. Add to your .zshrc: export RAYCAST_API_KEY="your-key-here"
4. Restart terminal

📖 Documentation: https://developers.raycast.com/api-reference
      `,
            github: `
🐙 GitHub Token Setup:
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with repo, user, workflow scopes
3. Add to your .zshrc: export GITHUB_TOKEN="your-token-here"
4. Restart terminal

🔗 URL: https://github.com/settings/tokens
      `,
            notion: `
📝 Notion Integration Setup:
1. Go to Notion Developers → Create new integration
2. Copy the Internal Integration Token
3. Add to your .zshrc: export NOTION_TOKEN="your-token-here"
4. Share databases/pages with your integration

🔗 URL: https://www.notion.so/my-integrations
      `,
            figma: `
🎨 Figma Token Setup:
1. Go to Figma Settings → Account → Personal access tokens
2. Generate new token
3. Add to your .zshrc: export FIGMA_TOKEN="your-token-here"
4. Restart terminal

🔗 URL: https://www.figma.com/developers/api#access-tokens
      `,
            slack: `
💬 Slack App Setup:
1. Go to Slack API → Create new app
2. Configure OAuth scopes and permissions
3. Install app to workspace
4. Add to your .zshrc: export SLACK_TOKEN="your-bot-token-here"

🔗 URL: https://api.slack.com/apps
      `
        };
        return instructions[service] || `Setup instructions not available for ${service}`;
    }
    // Check and suggest missing integrations
    async auditIntegrations() {
        const services = ['raycast', 'github', 'notion', 'figma', 'slack'];
        const report = ['🔍 Integration Audit Report:\n'];
        for (const service of services) {
            const hasAuth = this.hasCredentials(service);
            const status = hasAuth ? '✅' : '❌';
            const credential = hasAuth ? 'Configured' : 'Missing';
            report.push(`${status} ${service.toUpperCase()}: ${credential}`);
            if (!hasAuth) {
                report.push(`   💡 Run: raycast_auth setup ${service}`);
            }
        }
        report.push('\n🚀 Potential Integration Opportunities:');
        report.push('• Linear - Project management');
        report.push('• Jira - Issue tracking');
        report.push('• Confluence - Documentation');
        report.push('• Miro - Collaboration boards');
        report.push('• AWS - Cloud services');
        report.push('• Vercel - Deployment platform');
        return report.join('\n');
    }
}
// Export singleton instance
export const raycastAuth = new RaycastAuth();
//# sourceMappingURL=auth.js.map