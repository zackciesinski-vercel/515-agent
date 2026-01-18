# 5:15 Agent

An AI agent that drafts your weekly 5:15 status update by combining data from Google Calendar, Granola meeting notes, and Slack activity.

## What It Does

1. **Pulls calendar events** for the current week (Mon-Fri), filtering out recurring meetings and unconfirmed events
2. **Fetches Granola notes** from your local Granola cache and matches them to meetings
3. **Analyzes Slack activity** in channels where you posted 2+ messages
4. **Generates a draft** using Claude via Vercel AI Gateway
5. **Appends the draft** directly to your existing 5:15 Notion page

## Setup

### 1. Install Dependencies

```bash
cd ~/515-agent
npm install
```

### 2. Prerequisites

- **Granola** installed and running locally (the agent reads from `~/Library/Application Support/Granola/cache-v3.json`)
- A Notion page where you keep your 5:15 updates

### 3. Get API Credentials

#### Vercel AI Gateway Key
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Navigate to your project → Settings → AI Gateway
3. Create an AI Gateway API key

#### Google Calendar OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing)
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials (Desktop app)
5. Download credentials and get:
   - Client ID
   - Client Secret
6. Get a refresh token by running: `npx tsx scripts/get-google-token.ts`

#### Slack Token
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create a new app (or use existing)
3. Add OAuth scopes:
   - `search:read`
   - `users:read`
   - `channels:read`
4. Install to workspace
5. Copy the User OAuth Token (`xoxp-...`)
6. Get your Slack user ID (Profile → More → Copy member ID)

#### Notion Token
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Create a new integration
3. Copy the Internal Integration Token
4. **Important:** Share your 5:15 page with the integration (click "..." → "Add connections")

### 4. Create .env File

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Vercel AI Gateway
AI_GATEWAY_API_KEY=...

# Google Calendar OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...

# Slack
SLACK_TOKEN=xoxp-...
SLACK_USER_ID=U...

# Notion
NOTION_TOKEN=secret_...
NOTION_GRANOLA_DB_ID=...      # Optional: for Notion fallback
NOTION_515_PAGE_ID=...         # Your 5:15 page ID

# Your name (for personalization)
YOUR_NAME=YourName
```

### 5. Find Your Notion 5:15 Page ID

- Open your 5:15 page in Notion
- Copy the ID from the URL: `notion.so/[workspace]/[PAGE_ID]`
- The ID is the 32-character string (with or without dashes)

## Usage

### Manual Run

```bash
npm run draft
```

### Scheduled (Optional)

Add to crontab for automatic Friday drafts:

```bash
crontab -e
```

```cron
# Run every Friday at 4pm
0 16 * * 5 cd ~/515-agent && npm run draft >> ~/515-agent/515.log 2>&1
```

## Output

The agent appends to your existing 5:15 Notion page with:

- **Divider** separating from previous entries
- **Date** header
- **:tldr:** 2-3 sentence summary
- **✅ What I did**: Bullet points from meetings with Granola notes
- **🧠 What I am thinking about**: Empty for you to fill in
- **🏗️ What I am prioritizing next week**: Generated priorities

## How It Works

1. **Calendar filtering**: Removes recurring meetings (standups, syncs) and meetings you haven't accepted
2. **Granola matching**: Matches calendar events to Granola notes by title similarity and time proximity
3. **Content extraction**: Pulls meeting summaries, notes, and action items from Granola's local cache
4. **AI synthesis**: Claude analyzes all data and generates a cohesive 5:15 draft
5. **Notion output**: Appends the draft to your existing 5:15 page

## Customization

### Adjust Meeting Filtering

Edit `src/synthesis/draft.ts` to change which meetings are included:
- `isRecurring` - filters recurring calendar events
- `myResponseStatus` - filters by your RSVP status

### Adjust Slack Filtering

Edit `src/collectors/slack.ts` to change the minimum message threshold (default: 2+ messages per channel).

### Modify the Prompt

The synthesis prompt is in `src/synthesis/draft.ts`. Adjust the tone, structure, or instructions there.

### Change Output Format

Modify the Notion blocks in `src/output/notion.ts` to adjust headings, emojis, or structure.

## Troubleshooting

**"Missing required environment variable"**
- Make sure all variables in `.env` are set
- Check there are no extra spaces around values

**"No Granola notes found"**
- Make sure Granola is installed and has been used for meetings
- Check that `~/Library/Application Support/Granola/cache-v3.json` exists

**"Calendar events not matching Granola notes"**
- Meeting titles need to be similar between Calendar and Granola
- Times should be within a few hours of each other

**"No Slack messages found"**
- Verify your SLACK_USER_ID is correct
- Check that the token has `search:read` scope
- Note: DMs are filtered out by default

**"Notion API error"**
- Make sure the integration is shared with your 5:15 page
- Verify the page ID is correct (32-character string from URL)
