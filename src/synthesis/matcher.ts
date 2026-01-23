import { CalendarEvent } from '../collectors/calendar.js';
import { GranolaNote } from '../collectors/granola.js';
import { differenceInMinutes, format } from 'date-fns';
import { config } from '../config.js';

export interface MatchedMeeting {
  event: CalendarEvent;
  note: GranolaNote | null;
  hasNotes: boolean;
}

/**
 * Match Granola notes to calendar events based on title similarity and time proximity
 */
export function matchNotesToEvents(
  events: CalendarEvent[],
  notes: GranolaNote[]
): MatchedMeeting[] {
  const matched: MatchedMeeting[] = [];
  const usedNotes = new Set<string>();

  for (const event of events) {
    // Try to find a matching note
    let bestMatch: GranolaNote | null = null;
    let bestScore = 0;

    for (const note of notes) {
      if (usedNotes.has(note.id)) continue;

      const score = calculateMatchScore(event, note);
      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestMatch = note;
      }
    }

    if (bestMatch) {
      usedNotes.add(bestMatch.id);
      console.log(`   ✓ "${event.title}" → "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
    }

    matched.push({
      event,
      note: bestMatch,
      hasNotes: bestMatch !== null,
    });
  }

  return matched;
}

function calculateMatchScore(event: CalendarEvent, note: GranolaNote): number {
  // Title similarity is required - don't match on time alone
  const titleSimilarity = calculateTitleSimilarity(event.title, note.title);

  // Require at least some title match (25% word overlap)
  if (titleSimilarity < 0.25) {
    return 0;
  }

  let score = titleSimilarity * 0.6;

  // Time proximity bonus (only if titles match)
  const timeDiff = Math.abs(differenceInMinutes(event.start, note.date));
  if (timeDiff < 30) {
    score += 0.4;
  } else if (timeDiff < 120) {
    score += 0.3;
  } else if (timeDiff < 240) {
    score += 0.1;
  }

  return score;
}

function calculateTitleSimilarity(title1: string, title2: string): number {
  // Words to ignore: your own name (appears in all your meetings) and common filler words
  const yourName = config.yourName?.toLowerCase() || '';
  const yourFirstName = yourName.split(/\s+/)[0] || '';
  const ignoreWords = new Set([
    yourName, yourFirstName,
    'sync', 'meeting', 'call', 'chat', 'discussion', 'check', 'weekly', 'monthly'
  ].filter(w => w.length > 0));

  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .filter(w => !ignoreWords.has(w));

  const words1 = new Set(normalize(title1));
  const words2 = new Set(normalize(title2));

  if (words1.size === 0 || words2.size === 0) return 0;

  let matches = 0;
  for (const word of words1) {
    if (words2.has(word)) matches++;
  }

  return matches / Math.max(words1.size, words2.size);
}

/**
 * Collect all unique @mentions from matched meetings
 */
export function collectAllMentions(matched: MatchedMeeting[]): string[] {
  const mentions = new Set<string>();

  for (const meeting of matched) {
    // Add attendees
    for (const attendee of meeting.event.attendees) {
      mentions.add(attendee);
    }

    // Add mentions from notes
    if (meeting.note) {
      for (const mention of meeting.note.mentions) {
        mentions.add(mention);
      }
    }
  }

  return Array.from(mentions);
}

/**
 * Format a matched meeting for the synthesis prompt
 */
export function formatMatchedMeeting(meeting: MatchedMeeting): string {
  const { event, note } = meeting;
  const lines: string[] = [];

  lines.push(`## ${event.title}`);
  lines.push(`Date: ${format(event.start, 'EEEE, MMM d')} at ${format(event.start, 'h:mm a')}`);

  if (event.attendees.length > 0) {
    lines.push(`Attendees: ${event.attendees.slice(0, 5).join(', ')}${event.attendees.length > 5 ? ` (+${event.attendees.length - 5} more)` : ''}`);
  }

  if (note) {
    if (note.summary) {
      lines.push(`\nSummary: ${note.summary}`);
    }
    lines.push(`\nNotes:\n${note.content.slice(0, 1500)}${note.content.length > 1500 ? '...' : ''}`);

    if (note.actionItems.length > 0) {
      lines.push(`\nAction Items:`);
      for (const item of note.actionItems.slice(0, 5)) {
        lines.push(`  - ${item}`);
      }
    }
  } else {
    lines.push(`\n⚠️ No Granola notes found for this meeting`);
  }

  return lines.join('\n');
}
