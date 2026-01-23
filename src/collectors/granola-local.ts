/**
 * Granola collector that reads from the local Granola cache.
 * This is faster and more reliable than going through Notion.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { startOfWeek, endOfWeek, isWithinInterval, parseISO, format } from 'date-fns';

export interface GranolaNote {
  id: string;
  title: string;
  date: Date;
  summary?: string;
  content: string;
  attendees: string[];
  actionItems: string[];
  mentions: string[];
}

interface RawCacheData {
  cache?: string;
  documents?: Record<string, RawMeetingData>;
  documentPanels?: Record<string, RawPanelData>;
  transcripts?: Record<string, RawTranscriptData>;
  [key: string]: unknown;
}

interface RawMeetingData {
  title?: string;
  created_at?: string;
  people?: Array<{ name?: string }>;
  notes_plain?: string;
  notes_markdown?: string;
  notes?: { content?: RawContentNode[] };
  overview?: string;
  summary?: string;
  type?: string;
}

interface RawPanelData {
  [panelId: string]: { content?: unknown };
}

interface RawTranscriptData {
  text?: string;
  content?: string;
  transcript?: string;
}

interface RawContentNode {
  type?: string;
  text?: string;
  content?: RawContentNode[];
}

/**
 * Get the path to the Granola cache file.
 */
function getGranolaCachePath(): string {
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'Granola',
    'cache-v3.json'
  );
}

/**
 * Load and parse the Granola cache.
 */
function loadGranolaCache(): RawCacheData | null {
  const cachePath = getGranolaCachePath();

  if (!fs.existsSync(cachePath)) {
    console.log('   Granola cache not found at:', cachePath);
    return null;
  }

  try {
    const rawContent = fs.readFileSync(cachePath, 'utf-8');
    let rawData: RawCacheData = JSON.parse(rawContent);

    // Handle Granola's nested cache structure
    if (rawData.cache && typeof rawData.cache === 'string') {
      const actualData = JSON.parse(rawData.cache);
      if (actualData.state) {
        rawData = actualData.state;
      } else {
        rawData = actualData;
      }
    }

    return rawData;
  } catch (error) {
    console.error('   Error loading Granola cache:', error);
    return null;
  }
}

/**
 * Extract text content from Granola's structured notes format.
 */
function extractStructuredNotes(notesData: { content?: RawContentNode[] }): string {
  if (!notesData || !notesData.content) {
    return '';
  }

  const extractText = (contentList: RawContentNode[]): string => {
    const parts: string[] = [];
    if (Array.isArray(contentList)) {
      for (const item of contentList) {
        if (item && typeof item === 'object') {
          if (item.type === 'text' && item.text) {
            parts.push(item.text);
          } else if (item.content) {
            parts.push(extractText(item.content));
          }
        }
      }
    }
    return parts.join(' ');
  };

  return extractText(notesData.content);
}

/**
 * Extract text from document panels.
 */
function extractPanelContent(panelData: RawPanelData | undefined): string {
  if (!panelData) return '';

  const textParts: string[] = [];

  const extractFromNode = (node: unknown): void => {
    if (node === null || node === undefined) return;

    // Handle arrays first
    if (Array.isArray(node)) {
      for (const item of node) {
        extractFromNode(item);
      }
      return;
    }

    // Handle objects
    if (typeof node === 'object') {
      const nodeObj = node as Record<string, unknown>;

      // Extract text content
      if (nodeObj['type'] === 'text' && nodeObj['text']) {
        textParts.push(String(nodeObj['text']));
      }

      // Recursively process content array
      if (nodeObj['content']) {
        extractFromNode(nodeObj['content']);
      }
    }
  };

  try {
    if (panelData && typeof panelData === 'object' && !Array.isArray(panelData)) {
      const sortedKeys = Object.keys(panelData).sort();
      for (const panelId of sortedKeys) {
        const panel = panelData[panelId];
        if (panel && typeof panel === 'object' && 'content' in panel) {
          extractFromNode(panel.content);
        }
      }
    }
  } catch (error) {
    console.error('   Error extracting panel content:', error);
  }

  return textParts
    .map(part => (typeof part === 'string' ? part.trim() : ''))
    .filter(part => part)
    .join(' ')
    .trim();
}

/**
 * Extract action items from content.
 */
function extractActionItems(content: string): string[] {
  const actionItems: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.includes('[ ]') ||
      trimmed.toLowerCase().startsWith('action:') ||
      trimmed.toLowerCase().startsWith('todo:') ||
      trimmed.toLowerCase().startsWith('follow up:') ||
      trimmed.toLowerCase().startsWith('next step:')
    ) {
      actionItems.push(trimmed);
    }
  }

  return actionItems;
}

/**
 * Extract @mentions from content.
 */
function extractMentions(content: string): string[] {
  const mentionPattern = /@([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  const mentions = new Set<string>();

  let match;
  while ((match = mentionPattern.exec(content)) !== null) {
    mentions.add(match[1]);
  }

  return Array.from(mentions);
}

/**
 * Fetch Granola notes for the current week from the local cache.
 */
export async function getThisWeeksNotes(): Promise<GranolaNote[]> {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const fridayEnd = new Date(weekStart);
  fridayEnd.setDate(weekStart.getDate() + 4);
  fridayEnd.setHours(23, 59, 59, 999);

  console.log(`   Loading from local Granola cache for ${format(weekStart, 'MMM d')} - ${format(fridayEnd, 'MMM d')}`);

  const cacheData = loadGranolaCache();
  if (!cacheData || !cacheData.documents) {
    console.log('   No Granola data available');
    return [];
  }

  const notes: GranolaNote[] = [];
  const documentPanels = cacheData.documentPanels ?? {};

  for (const [docId, docData] of Object.entries(cacheData.documents)) {
    try {
      // Parse date
      let meetingDate: Date | null = null;
      if (docData.created_at) {
        let dateStr = docData.created_at;
        if (dateStr.endsWith('Z')) {
          dateStr = dateStr.slice(0, -1) + '+00:00';
        }
        meetingDate = new Date(dateStr);
      }

      if (!meetingDate) continue;

      // Check if within this week
      if (!isWithinInterval(meetingDate, { start: weekStart, end: fridayEnd })) {
        continue;
      }

      // Extract content
      const contentParts: string[] = [];

      if (docData.notes_plain) {
        contentParts.push(docData.notes_plain);
      } else if (docData.notes_markdown) {
        contentParts.push(docData.notes_markdown);
      } else if (docData.notes && typeof docData.notes === 'object') {
        const notesContent = extractStructuredNotes(docData.notes);
        if (notesContent) contentParts.push(notesContent);
      }

      // Try document panels as fallback
      if (!contentParts.some(part => part.trim())) {
        const panelText = extractPanelContent(documentPanels[docId] as RawPanelData);
        if (panelText) contentParts.push(panelText);
      }

      // Add overview/summary
      if (docData.overview) {
        contentParts.push(`Overview: ${docData.overview}`);
      }
      if (docData.summary) {
        contentParts.push(`Summary: ${docData.summary}`);
      }

      const content = contentParts.join('\n\n');

      // Extract attendees
      const attendees: string[] = [];
      if (docData.people && Array.isArray(docData.people)) {
        for (const person of docData.people) {
          if (person.name) {
            attendees.push(person.name);
          }
        }
      }

      notes.push({
        id: docId,
        title: docData.title ?? 'Untitled Meeting',
        date: meetingDate,
        summary: docData.summary || docData.overview,
        content,
        attendees,
        actionItems: extractActionItems(content),
        mentions: extractMentions(content),
      });
    } catch (error) {
      console.error(`   Error parsing meeting ${docId}:`, error);
    }
  }

  // Sort by date
  notes.sort((a, b) => a.date.getTime() - b.date.getTime());

  console.log(`   Found ${notes.length} Granola notes for this week`);
  return notes;
}

/**
 * Check if local Granola cache is available.
 */
export function isGranolaCacheAvailable(): boolean {
  return fs.existsSync(getGranolaCachePath());
}
