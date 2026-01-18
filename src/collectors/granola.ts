import { Client } from '@notionhq/client';
import { startOfWeek, format, parseISO, isWithinInterval } from 'date-fns';
import { config } from '../config.js';

const notion = new Client({ auth: config.notion.token });

export interface GranolaNote {
  id: string;
  title: string;
  date: Date;
  summary?: string;
  content: string;
  attendees: string[];
  actionItems: string[];
  mentions: string[]; // @mentions extracted from content
}

export async function getThisWeeksNotes(): Promise<GranolaNote[]> {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const fridayEnd = new Date(weekStart);
  fridayEnd.setDate(weekStart.getDate() + 4);
  fridayEnd.setHours(23, 59, 59, 999);

  console.log(`Fetching Granola notes from Notion for ${format(weekStart, 'MMM d')} - ${format(fridayEnd, 'MMM d')}`);

  // Query the Granola database for this week's notes
  // Granola typically creates pages with a Date property
  const response = await notion.databases.query({
    database_id: config.notion.granolaDatabaseId,
    filter: {
      and: [
        {
          property: 'Date',
          date: {
            on_or_after: format(weekStart, 'yyyy-MM-dd'),
          },
        },
        {
          property: 'Date',
          date: {
            on_or_before: format(fridayEnd, 'yyyy-MM-dd'),
          },
        },
      ],
    },
    sorts: [
      {
        property: 'Date',
        direction: 'ascending',
      },
    ],
  });

  const notes: GranolaNote[] = [];

  for (const page of response.results) {
    if ('properties' in page) {
      const note = await extractNoteFromPage(page);
      if (note) {
        notes.push(note);
      }
    }
  }

  console.log(`Found ${notes.length} Granola notes for this week`);
  return notes;
}

async function extractNoteFromPage(page: any): Promise<GranolaNote | null> {
  try {
    // Extract title
    const titleProp = page.properties.Name || page.properties.Title || page.properties.title;
    let title = 'Untitled Meeting';
    if (titleProp?.title?.[0]?.plain_text) {
      title = titleProp.title[0].plain_text;
    }

    // Extract date
    const dateProp = page.properties.Date || page.properties.date;
    let date = new Date();
    if (dateProp?.date?.start) {
      date = parseISO(dateProp.date.start);
    }

    // Extract attendees (if Granola adds this)
    const attendeesProp = page.properties.Attendees || page.properties.People;
    const attendees: string[] = [];
    if (attendeesProp?.multi_select) {
      attendees.push(...attendeesProp.multi_select.map((s: any) => s.name));
    } else if (attendeesProp?.people) {
      attendees.push(...attendeesProp.people.map((p: any) => p.name));
    }

    // Get the full page content
    const blocks = await notion.blocks.children.list({
      block_id: page.id,
      page_size: 100,
    });

    const content = extractTextFromBlocks(blocks.results);
    const mentions = extractMentions(content);
    const actionItems = extractActionItems(content);
    const summary = extractSummary(content);

    return {
      id: page.id,
      title,
      date,
      summary,
      content,
      attendees,
      actionItems,
      mentions,
    };
  } catch (error) {
    console.error(`Error extracting note from page:`, error);
    return null;
  }
}

function extractTextFromBlocks(blocks: any[]): string {
  const textParts: string[] = [];

  for (const block of blocks) {
    if (block.type === 'paragraph' && block.paragraph?.rich_text) {
      const text = block.paragraph.rich_text.map((t: any) => t.plain_text).join('');
      if (text) textParts.push(text);
    } else if (block.type === 'bulleted_list_item' && block.bulleted_list_item?.rich_text) {
      const text = block.bulleted_list_item.rich_text.map((t: any) => t.plain_text).join('');
      if (text) textParts.push(`• ${text}`);
    } else if (block.type === 'numbered_list_item' && block.numbered_list_item?.rich_text) {
      const text = block.numbered_list_item.rich_text.map((t: any) => t.plain_text).join('');
      if (text) textParts.push(`- ${text}`);
    } else if (block.type === 'heading_1' && block.heading_1?.rich_text) {
      const text = block.heading_1.rich_text.map((t: any) => t.plain_text).join('');
      if (text) textParts.push(`# ${text}`);
    } else if (block.type === 'heading_2' && block.heading_2?.rich_text) {
      const text = block.heading_2.rich_text.map((t: any) => t.plain_text).join('');
      if (text) textParts.push(`## ${text}`);
    } else if (block.type === 'heading_3' && block.heading_3?.rich_text) {
      const text = block.heading_3.rich_text.map((t: any) => t.plain_text).join('');
      if (text) textParts.push(`### ${text}`);
    } else if (block.type === 'to_do' && block.to_do?.rich_text) {
      const text = block.to_do.rich_text.map((t: any) => t.plain_text).join('');
      const checked = block.to_do.checked ? '[x]' : '[ ]';
      if (text) textParts.push(`${checked} ${text}`);
    }
  }

  return textParts.join('\n');
}

function extractMentions(content: string): string[] {
  // Look for @Name patterns in the content
  const mentionPattern = /@([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  const mentions: Set<string> = new Set();

  let match;
  while ((match = mentionPattern.exec(content)) !== null) {
    mentions.add(match[1]);
  }

  return Array.from(mentions);
}

function extractActionItems(content: string): string[] {
  const actionItems: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Look for todo items or lines starting with action keywords
    if (line.includes('[ ]') ||
        line.toLowerCase().includes('action:') ||
        line.toLowerCase().includes('todo:') ||
        line.toLowerCase().includes('follow up:') ||
        line.toLowerCase().includes('next step:')) {
      actionItems.push(line.trim());
    }
  }

  return actionItems;
}

function extractSummary(content: string): string | undefined {
  // Look for a summary section in Granola notes
  const lines = content.split('\n');
  let inSummary = false;
  const summaryLines: string[] = [];

  for (const line of lines) {
    if (line.toLowerCase().includes('summary') || line.toLowerCase().includes('tldr')) {
      inSummary = true;
      continue;
    }
    if (inSummary) {
      if (line.startsWith('#') || line === '') {
        if (summaryLines.length > 0) break;
      } else {
        summaryLines.push(line);
      }
    }
  }

  return summaryLines.length > 0 ? summaryLines.join(' ').slice(0, 500) : undefined;
}
