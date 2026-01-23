import { generateText, gateway } from 'ai';
import { format } from 'date-fns';
import { config } from '../config.js';
import { getThisWeeksMeetings, getWeekDateRange, CalendarEvent } from '../collectors/calendar.js';
import { getThisWeeksNotes as getNotesFromNotion, GranolaNote } from '../collectors/granola.js';
import { getThisWeeksNotes as getNotesFromLocalCache, isGranolaCacheAvailable } from '../collectors/granola-local.js';
import { getActiveChannels, SlackChannelActivity } from '../collectors/slack.js';
import { getPrevious515, Previous515 } from '../collectors/previous515.js';
import { matchNotesToEvents, MatchedMeeting, formatMatchedMeeting } from './matcher.js';

export interface Draft515 {
  date: string;
  tldr: string;
  whatIDid: string[];
  whatIAmThinkingAbout: string;
  priorities: string[];
  meetingsWithoutNotes: string[];
}

export async function synthesizeDraft(): Promise<Draft515> {
  const weekRange = getWeekDateRange();
  const today = format(new Date(), 'MMMM d, yyyy');

  console.log('🤖 Starting 5:15 Agent...\n');

  // Step 1: Fetch calendar events
  console.log('📅 Fetching calendar events...');
  let calendarEvents: CalendarEvent[] = [];
  try {
    const allEvents = await getThisWeeksMeetings();
    console.log(`   Found ${allEvents.length} total events`);

    // Filter out recurring meetings (standups, syncs, etc.)
    const nonRecurring = allEvents.filter(e => !e.isRecurring);
    console.log(`   ${allEvents.length - nonRecurring.length} recurring meetings filtered out`);

    // Filter out meetings I haven't confirmed (only keep accepted or meetings I created)
    calendarEvents = nonRecurring.filter(e =>
      e.myResponseStatus === 'accepted' ||
      e.myResponseStatus === 'unknown' // unknown usually means I'm the organizer
    );
    console.log(`   ${nonRecurring.length - calendarEvents.length} unconfirmed meetings filtered out`);
    console.log(`   ${calendarEvents.length} relevant meetings remaining`);
  } catch (error) {
    console.log('   ❌ Calendar fetch failed:', error);
  }

  // Step 2: Fetch Slack activity
  console.log('💬 Fetching Slack activity...');
  let slackActivity: SlackChannelActivity[] = [];
  if (config.slack.enabled) {
    try {
      slackActivity = await getActiveChannels();
      console.log(`   Found ${slackActivity.length} active channels`);
    } catch (error) {
      console.log('   ❌ Slack fetch failed:', error);
    }
  } else {
    console.log('   ⏸️  Slack not configured, skipping');
  }

  // Step 3: Fetch Granola notes (prefer local cache over Notion)
  console.log('📝 Fetching Granola notes...');
  let granolaNotes: GranolaNote[] = [];
  if (isGranolaCacheAvailable()) {
    try {
      granolaNotes = await getNotesFromLocalCache();
      console.log(`   Found ${granolaNotes.length} notes (from local cache)`);
    } catch (error) {
      console.log('   ❌ Local Granola fetch failed:', error);
      // Fall back to Notion if local cache fails
      if (config.notion.enabled) {
        try {
          granolaNotes = await getNotesFromNotion();
          console.log(`   Found ${granolaNotes.length} notes (from Notion fallback)`);
        } catch (notionError) {
          console.log('   ❌ Notion fallback also failed:', notionError);
        }
      }
    }
  } else if (config.notion.enabled) {
    try {
      granolaNotes = await getNotesFromNotion();
      console.log(`   Found ${granolaNotes.length} notes (from Notion)`);
    } catch (error) {
      console.log('   ❌ Granola fetch failed:', error);
    }
  } else {
    console.log('   ⏸️  No Granola source available (no local cache, Notion not configured)');
  }

  // Step 4: Fetch previous 5:15
  console.log('📋 Fetching previous 5:15...');
  let previous515: Previous515 | null = null;
  if (config.notion.enabled) {
    try {
      previous515 = await getPrevious515();
      if (previous515) {
        console.log(`   Found 5:15 from ${previous515.date}`);
      } else {
        console.log('   No previous 5:15 found');
      }
    } catch (error) {
      console.log('   ❌ Previous 5:15 fetch failed:', error);
    }
  } else {
    console.log('   ⏸️  Notion not configured, skipping');
  }

  // Step 5: Match notes to meetings
  console.log('🔗 Matching notes to calendar events...');
  const matchedMeetings = matchNotesToEvents(calendarEvents, granolaNotes);
  const withNotes = matchedMeetings.filter(m => m.hasNotes).length;
  const withoutNotes = matchedMeetings.filter(m => !m.hasNotes).length;
  console.log(`   ${withNotes} with notes, ${withoutNotes} without`);

  // Step 6: Generate draft with Claude
  console.log('\n✨ Generating draft with Claude...\n');

  const meetingsContext = matchedMeetings
    .map(formatMatchedMeeting)
    .join('\n\n---\n\n');

  const slackContext = slackActivity.length > 0
    ? slackActivity.map(ch => {
        const messages = ch.messages.slice(0, 3).map(m => `  - "${m.text.slice(0, 100)}..."`).join('\n');
        return `#${ch.channelName}: ${ch.messageCount} messages\n${messages}`;
      }).join('\n\n')
    : 'No significant Slack activity this week';

  const previousContext = previous515
    ? `Last week's priorities:\n${previous515.priorities.map(p => `- ${p}`).join('\n')}`
    : 'No previous 5:15 found';

  const systemPrompt = `You are an AI assistant helping ${config.yourName} draft their weekly 5:15 status update.

Today is ${today}. You're drafting the 5:15 for the week of ${weekRange.display}.

## CRITICAL RULES
- ONLY use information explicitly provided in the meeting notes below
- DO NOT invent, assume, or hallucinate any details not in the notes
- DO NOT make up what was discussed if it's not in the notes
- If a meeting has notes, summarize ONLY what the notes say
- Skip meetings that don't have notes entirely

## 5:15 Format

Your response should be a complete 5:15 in this exact format:

## ${today}

### :tldr: TLDR
[2-3 sentences summarizing the week based ONLY on the provided notes]

### ✅ What I did
- [One bullet per meeting that has notes]
- [Summarize what the notes actually say - don't invent details]
- [Use @FirstName LastName for people mentioned IN the notes]
- [Skip meetings without notes]

### 🧠 What I am thinking about
<!-- ${config.yourName} will write this section -->

### 🏗️ What I am prioritizing next week
- [Extract action items and follow-ups ONLY from the provided notes]

## Style Guidelines
- Be concise and factual
- Only state what's in the notes - nothing more
- Don't embellish or add context not in the source data`;

  const prompt = `Please draft my 5:15 for this week based on the following data:

## Calendar Events & Meeting Notes
${meetingsContext || 'No calendar events found'}

## Slack Activity
${slackContext}

## Previous Week Context
${previousContext}

Generate the 5:15 now.`;

  const { text } = await generateText({
    model: gateway('anthropic/claude-sonnet-4'),
    system: systemPrompt,
    prompt,
  });

  console.log('✅ Draft generated!\n');

  return parseDraftResponse(text, today, matchedMeetings);
}

function parseDraftResponse(
  response: string,
  today: string,
  matchedMeetings: MatchedMeeting[]
): Draft515 {
  const tldrMatch = response.match(/TLDR\s*\n+([\s\S]*?)(?=###|$)/i);
  const whatIDidMatch = response.match(/What I did\s*\n+([\s\S]*?)(?=###|$)/i);
  const prioritiesMatch = response.match(/prioritizing next week\s*\n+([\s\S]*?)(?=###|$)/i);

  const tldr = tldrMatch?.[1]?.trim() || 'Draft your TLDR here.';

  const whatIDid = whatIDidMatch?.[1]
    ?.split('\n')
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
    .map(line => line.replace(/^[\s\-•]+/, '').trim())
    .filter(Boolean) || [];

  const priorities = prioritiesMatch?.[1]
    ?.split('\n')
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
    .map(line => line.replace(/^[\s\-•]+/, '').trim())
    .filter(Boolean) || [];

  const meetingsWithoutNotes = matchedMeetings
    .filter(m => !m.hasNotes)
    .map(m => m.event.title);

  return {
    date: today,
    tldr,
    whatIDid,
    whatIAmThinkingAbout: '<!-- Your reflections here -->',
    priorities,
    meetingsWithoutNotes,
  };
}
