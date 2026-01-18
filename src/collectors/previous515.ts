import { Client } from '@notionhq/client';
import { subWeeks, format, startOfWeek } from 'date-fns';
import { config } from '../config.js';

const notion = new Client({ auth: config.notion.token });

export interface Previous515 {
  date: string;
  priorities: string[];
  fullContent: string;
}

export async function getPrevious515(): Promise<Previous515 | null> {
  console.log('Fetching previous week\'s 5:15...');

  try {
    // Get the 5:15 parent page's children
    const response = await notion.blocks.children.list({
      block_id: config.notion.output515PageId,
      page_size: 50,
    });

    // Find the most recent 5:15 page (they should be child pages)
    // We look for pages created in the previous week
    const lastWeek = subWeeks(new Date(), 1);
    const lastWeekStart = startOfWeek(lastWeek, { weekStartsOn: 1 });

    let mostRecentPage: any = null;
    let mostRecentDate: Date | null = null;

    for (const block of response.results) {
      if (block.type === 'child_page') {
        // Get the page details
        const pageId = block.id;
        try {
          const page = await notion.pages.retrieve({ page_id: pageId });

          if ('created_time' in page) {
            const createdDate = new Date(page.created_time);

            // Check if this is the most recent page before this week
            if (createdDate < startOfWeek(new Date(), { weekStartsOn: 1 })) {
              if (!mostRecentDate || createdDate > mostRecentDate) {
                mostRecentDate = createdDate;
                mostRecentPage = page;
              }
            }
          }
        } catch {
          // Skip pages we can't access
          continue;
        }
      }
    }

    if (!mostRecentPage) {
      console.log('No previous 5:15 found');
      return null;
    }

    // Get the content of the previous 5:15
    const blocks = await notion.blocks.children.list({
      block_id: mostRecentPage.id,
      page_size: 100,
    });

    const fullContent = extractTextFromBlocks(blocks.results);
    const priorities = extractPriorities(fullContent);

    console.log(`Found previous 5:15 from ${format(mostRecentDate!, 'MMM d, yyyy')} with ${priorities.length} priorities`);

    return {
      date: format(mostRecentDate!, 'MMMM d, yyyy'),
      priorities,
      fullContent,
    };
  } catch (error) {
    console.error('Error fetching previous 5:15:', error);
    return null;
  }
}

function extractTextFromBlocks(blocks: any[]): string {
  const textParts: string[] = [];

  for (const block of blocks) {
    const text = extractBlockText(block);
    if (text) textParts.push(text);
  }

  return textParts.join('\n');
}

function extractBlockText(block: any): string | null {
  const typeMap: Record<string, string> = {
    paragraph: 'paragraph',
    heading_1: 'heading_1',
    heading_2: 'heading_2',
    heading_3: 'heading_3',
    bulleted_list_item: 'bulleted_list_item',
    numbered_list_item: 'numbered_list_item',
    to_do: 'to_do',
  };

  const type = typeMap[block.type];
  if (!type) return null;

  const content = block[type];
  if (!content?.rich_text) return null;

  const text = content.rich_text.map((t: any) => t.plain_text).join('');
  if (!text) return null;

  switch (block.type) {
    case 'heading_1':
      return `# ${text}`;
    case 'heading_2':
      return `## ${text}`;
    case 'heading_3':
      return `### ${text}`;
    case 'bulleted_list_item':
      return `• ${text}`;
    case 'numbered_list_item':
      return `- ${text}`;
    case 'to_do':
      return `${content.checked ? '[x]' : '[ ]'} ${text}`;
    default:
      return text;
  }
}

function extractPriorities(content: string): string[] {
  const lines = content.split('\n');
  const priorities: string[] = [];
  let inPrioritiesSection = false;

  for (const line of lines) {
    // Check if we're entering the priorities section
    if (line.toLowerCase().includes('prioritizing') ||
        line.toLowerCase().includes('priorities') ||
        line.toLowerCase().includes('next week')) {
      inPrioritiesSection = true;
      continue;
    }

    // If we're in the priorities section, collect bullet points
    if (inPrioritiesSection) {
      // Stop if we hit another section header
      if (line.startsWith('#') || line.startsWith('##')) {
        break;
      }

      // Collect bullet points
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
        const priority = line.replace(/^[•\-*]\s*/, '').trim();
        if (priority) {
          priorities.push(priority);
        }
      }
    }
  }

  return priorities;
}
