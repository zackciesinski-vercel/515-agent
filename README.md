# 5:15 Agent

An AI agent that drafts your weekly 5:15 status update by combining data from Google Calendar, Granola meeting notes, and Slack activity.

## What It Does

1. **Pulls calendar events** for the current week (Mon-Fri)
2. **Fetches Granola notes** from Notion and matches them to meetings
3. **Analyzes Slack activity** in channels where you posted 2+ messages
4. **Retrieves last week's 5:15** to carry forward priorities
5. **Generates a draft** using Claude with your writing style
6. **Writes the draft** directly to Notion

## Setup

### 1. Install Dependencies

```bash
cd ~/515-agent
npm install
```

### 2. Configure Granola → Notion Sync

1. Open Granola: **Settings → Integrations → Notion**
2. Connect your Notion workspace
3. Create a database called "Meeting Notes" (or use existing)
4. Note the database ID from the URL: `notion.so/[workspace]/[DATABASE_ID]?v=...`

### 3. Get API Credentials

#### Anthropic API Key
- Go to [console.anthropic.com](https://console.anthropic.com)
- Create an API key

#### Google Calendar OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing)
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials (Desktop app)
5. Download credentials and get:
   - Client ID
   - Client Secret
6. Get a refresh token by running the OAuth flow once

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
4. Share your Granola database AND 5:15 page with the integration

### 4. Create .env File

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
SLACK_TOKEN=xoxp-...
SLACK_USER_ID=U...
NOTION_TOKEN=secret_...
NOTION_GRANOLA_DB_ID=...
NOTION_515_PAGE_ID=...
YOUR_NAME=Zack
```

### 5. Find Your Notion IDs

**Granola Database ID:**
- Open your Granola meeting notes database in Notion
- Copy the ID from the URL: `notion.so/[workspace]/[DATABASE_ID]?v=...`

**5:15 Parent Page ID:**
- Open the page where you want 5:15 drafts created
- Copy the ID from the URL: `notion.so/[workspace]/[PAGE_ID]`

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

The agent creates a new Notion page under your 5:15 parent page with:

- **TLDR**: 2-3 sentence summary
- **What I did**: Bullet points with @mentions and #channels
- **What I am thinking about**: Left blank for you to write
- **What I am prioritizing next week**: Carried forward + new items

Meetings without Granola notes are flagged with ⚠️ so you know to fill in details.

## Customization

### Adjust Slack Filtering

Edit `src/collectors/slack.ts` line with `channel.messages.length > 1` to change the minimum message threshold.

### Modify the Prompt

The synthesis prompt is in `src/synthesis/draft.ts` in the `buildPrompt` function. Adjust the tone, structure, or instructions there.

### Change Output Format

Modify the Notion blocks in `src/output/notion.ts` to adjust headings, emojis, or structure.

## Troubleshooting

**"Missing required environment variable"**
- Make sure all variables in `.env` are set
- Check there are no extra spaces around values

**"Granola notes not matching"**
- Ensure the Date property in your Granola Notion database matches the expected format
- Check that meeting titles in Granola roughly match calendar event titles

**"No Slack messages found"**
- Verify your SLACK_USER_ID is correct
- Check that the token has `search:read` scope
- Note: DMs are filtered out by default

**"Notion API error"**
- Make sure the integration is shared with both the Granola DB and 5:15 page
- Verify the page/database IDs are correct (not the URL, just the ID portion)
