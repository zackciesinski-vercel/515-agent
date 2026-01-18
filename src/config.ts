import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const config = {
  aiGateway: {
    apiKey: optionalEnv('AI_GATEWAY_API_KEY'), // AI SDK reads this automatically
  },
  google: {
    clientId: requireEnv('GOOGLE_CLIENT_ID'),
    clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
    refreshToken: requireEnv('GOOGLE_REFRESH_TOKEN'),
  },
  slack: {
    token: optionalEnv('SLACK_TOKEN'),
    userId: optionalEnv('SLACK_USER_ID'),
    enabled: !!(process.env.SLACK_TOKEN && process.env.SLACK_USER_ID),
  },
  notion: {
    token: optionalEnv('NOTION_TOKEN'),
    granolaDatabaseId: optionalEnv('NOTION_GRANOLA_DB_ID'),
    output515PageId: optionalEnv('NOTION_515_PAGE_ID'),
    enabled: !!(process.env.NOTION_TOKEN && process.env.NOTION_GRANOLA_DB_ID && process.env.NOTION_515_PAGE_ID),
  },
  yourName: process.env.YOUR_NAME || 'Zack',
};
