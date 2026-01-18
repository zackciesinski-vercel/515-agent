#!/usr/bin/env node

import { config } from './config.js';
import { getWeekDateRange } from './collectors/calendar.js';
import { isGranolaCacheAvailable } from './collectors/granola-local.js';
import { synthesizeDraft } from './synthesis/draft.js';
import { writeDraftToNotion } from './output/notion.js';
import { writeDraftToMarkdown } from './output/markdown.js';

async function main() {
  console.log(`
╔═══════════════════════════════════════════════╗
║           5:15 Agent - Weekly Draft           ║
╚═══════════════════════════════════════════════╝
`);

  const weekRange = getWeekDateRange();
  console.log(`📅 Drafting 5:15 for: ${weekRange.display}\n`);

  // Show what integrations are enabled
  const hasLocalGranola = isGranolaCacheAvailable();
  const granolaStatus = hasLocalGranola
    ? '✅ Local cache'
    : (config.notion.enabled ? '✅ Notion' : '⏸️  Disabled');

  console.log('🔌 Integrations:');
  console.log(`   - Google Calendar: ${config.google.clientId ? '✅ Enabled' : '⏸️  Disabled'}`);
  console.log(`   - Slack: ${config.slack.enabled ? '✅ Enabled' : '⏸️  Disabled'}`);
  console.log(`   - Granola: ${granolaStatus}`);
  console.log(`   - Output: ${config.notion.enabled ? 'Notion' : 'Markdown file'}\n`);

  try {
    // The agent will autonomously gather data via tools and generate the draft
    const draft = await synthesizeDraft();

    // Write output
    let outputLocation: string;

    if (config.notion.enabled) {
      console.log('📝 Appending draft to your 5:15 page...\n');
      const { url } = await writeDraftToNotion(draft);
      outputLocation = url;
    } else {
      console.log('📝 Writing draft to markdown file...\n');
      const { filePath } = writeDraftToMarkdown(draft);
      outputLocation = filePath;
    }

    // Summary
    console.log(`
╔═══════════════════════════════════════════════╗
║                   ✅ Done!                     ║
╚═══════════════════════════════════════════════╝

Your 5:15 draft is ready: ${outputLocation}

Next steps:
1. ${config.notion.enabled ? 'Open the draft in Notion' : 'Open the markdown file'}
2. Fill in the "What I am thinking about" section
3. Review and edit the generated content
4. ${config.notion.enabled ? 'Publish when ready!' : 'Copy to Notion when ready!'}
`);
  } catch (error) {
    console.error('\n❌ Error generating 5:15 draft:', error);
    process.exit(1);
  }
}

// Run the agent
main();
