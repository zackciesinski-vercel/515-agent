import { Client } from '@notionhq/client';
import { config } from '../config.js';
import { Draft515 } from '../synthesis/draft.js';

const notion = new Client({ auth: config.notion.token });

export interface NotionOutput {
  pageId: string;
  url: string;
}

export async function writeDraftToNotion(draft: Draft515): Promise<NotionOutput> {
  const pageId = config.notion.output515PageId!;

  console.log('Appending 5:15 draft to existing Notion page...');

  // Build blocks in the user's format
  const blocks = buildNotionBlocks(draft);

  // Append to the existing page
  await notion.blocks.children.append({
    block_id: pageId,
    children: blocks,
  });

  const pageUrl = `https://notion.so/${pageId.replace(/-/g, '')}`;

  console.log(`✅ Draft appended: ${pageUrl}`);

  return {
    pageId,
    url: pageUrl,
  };
}

function buildNotionBlocks(draft: Draft515): any[] {
  const blocks: any[] = [];

  // Divider to separate from previous entries
  blocks.push(divider());

  // Date header
  blocks.push(paragraph(draft.date));

  // TLDR Section (matching user's format: :tldr: on its own line, then content)
  blocks.push(
    paragraph(':tldr:'),
    paragraph(draft.tldr),
  );

  // What I did Section
  blocks.push(heading2('✅ What I did'));

  for (const item of draft.whatIDid) {
    blocks.push(bulletItem(item));
  }

  // What I am thinking about Section
  blocks.push(heading2('🧠 What I am thinking about'));
  // Leave empty for user to fill in
  blocks.push(bulletItem(''));

  // Priorities Section
  blocks.push(heading2('🏗️ What I am prioritizing next week'));

  for (const priority of draft.priorities) {
    blocks.push(bulletItem(priority));
  }

  return blocks;
}

// Helper functions to create Notion blocks

function divider(): any {
  return {
    object: 'block',
    type: 'divider',
    divider: {},
  };
}

function heading2(text: string): any {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  };
}

function paragraph(text: string): any {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: parseRichText(text),
    },
  };
}

function bulletItem(text: string): any {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: parseRichText(text),
    },
  };
}

/**
 * Parse text to handle **bold**, @mentions and #channels
 * Returns rich_text array for Notion
 */
function parseRichText(text: string): any[] {
  const parts: any[] = [];

  // Pattern to match **bold**, @Name Name, or #channel-name
  const pattern = /(\*\*[^*]+\*\*|@[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|#[\w-]+)/g;

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        text: { content: text.slice(lastIndex, match.index) },
      });
    }

    const matchedText = match[0];

    if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
      // Bold text - remove ** and add bold annotation
      parts.push({
        type: 'text',
        text: { content: matchedText.slice(2, -2) },
        annotations: { bold: true },
      });
    } else {
      // @mention or #channel - add bold formatting
      parts.push({
        type: 'text',
        text: { content: matchedText },
        annotations: { bold: true },
      });
    }

    lastIndex = pattern.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      text: { content: text.slice(lastIndex) },
    });
  }

  // If no matches, return simple text
  if (parts.length === 0) {
    return [{ type: 'text', text: { content: text } }];
  }

  return parts;
}
