#!/usr/bin/env npx tsx

/**
 * Helper script to get a Google OAuth refresh token
 * Run: npx tsx scripts/get-google-token.ts
 */

import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
  process.exit(1);
}

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'http://localhost:8080/oauth2callback'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Google Calendar OAuth Token Generator             ║
╚═══════════════════════════════════════════════════════════╝

1. Open this URL in your browser:

${authUrl}

2. Sign in with your Google account
3. Authorize calendar access
4. You'll be redirected - the token will appear here

Waiting for authorization...
`);

// Start local server to catch the callback
const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith('/oauth2callback')) {
    const queryParams = new url.URL(req.url, 'http://localhost:8080').searchParams;
    const code = queryParams.get('code');

    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>✅ Success! You can close this window.</h1><p>Return to your terminal.</p>');

        console.log(`
╔═══════════════════════════════════════════════════════════╗
║                      ✅ Success!                           ║
╚═══════════════════════════════════════════════════════════╝

Add this to your .env file:

GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}

`);

        server.close();
        process.exit(0);
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>❌ Error getting token</h1>');
        console.error('Error:', err.message);
        server.close();
        process.exit(1);
      }
    }
  }
});

server.listen(8080, () => {
  // Server ready
});
