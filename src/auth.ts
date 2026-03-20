import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

export class RaycastAuth {
  private config: AuthConfig;

  constructor(config: AuthConfig = {}) {
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

  // Validate service name against known set
  private validateService(service: string): string {
    const allowed = ['raycast', 'github', 'notion', 'figma', 'slack', 'linear', 'jira'];
    if (typeof service !== 'string' || !allowed.includes(service)) {
      throw new Error(`Invalid service: must be one of ${allowed.join(', ')}`);
    }
    return service;
  }

  // OAuth flow for Raycast extensions
  async initiateOAuth(service: string): Promise<string> {
    this.validateService(service);
    const oauthUrls: { [key: string]: string } = {
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

    // Open OAuth URL in browser — use execFile to avoid shell injection
    await execFileAsync('open', [url]);

    return url;
  }

  // Check if credentials are configured
  hasCredentials(service: string): boolean {
    this.validateService(service);
    const serviceMap: { [key: string]: keyof AuthConfig } = {
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
  getCredential(service: string): string | undefined {
    this.validateService(service);
    const serviceMap: { [key: string]: keyof AuthConfig } = {
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

  // Validate API credentials — returns only safe summary fields, never raw tokens or full API responses
  async validateCredentials(service: string): Promise<{ valid: boolean; username?: string; error?: string }> {
    this.validateService(service);
    const token = this.getCredential(service);
    if (!token) {
      return { valid: false, error: 'No credentials found' };
    }

    try {
      const validators: { [key: string]: () => Promise<{ valid: boolean; username: string }> } = {
        github: async () => {
          const response = await fetch('https://api.github.com/user', {
            headers: { Authorization: `token ${token}` }
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data = await response.json() as { login?: string };
          return { valid: true, username: data.login ?? 'unknown' };
        },
        notion: async () => {
          const response = await fetch('https://api.notion.com/v1/users/me', {
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': '2022-06-28'
            }
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data = await response.json() as { name?: string };
          return { valid: true, username: data.name ?? 'unknown' };
        },
        figma: async () => {
          const response = await fetch('https://api.figma.com/v1/me', {
            headers: { 'X-Figma-Token': token }
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data = await response.json() as { handle?: string };
          return { valid: true, username: data.handle ?? 'unknown' };
        }
      };

      const validator = validators[service];
      if (!validator) {
        return { valid: false, error: 'Validation not implemented for this service' };
      }

      const result = await validator();
      return { valid: result.valid, username: result.username };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  // Generate credential setup instructions
  getSetupInstructions(service: string): string {
    const instructions: { [key: string]: string } = {
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
  async auditIntegrations(): Promise<string> {
    const services = ['raycast', 'github', 'notion', 'figma', 'slack'];
    const report: string[] = ['🔍 Integration Audit Report:\n'];

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