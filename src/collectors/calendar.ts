import { google } from 'googleapis';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { config } from '../config.js';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  attendees: string[];
  meetingLink?: string;
  isRecurring: boolean;
  myResponseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction' | 'unknown';
}

export async function getThisWeeksMeetings(): Promise<CalendarEvent[]> {
  const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret
  );

  oauth2Client.setCredentials({
    refresh_token: config.google.refreshToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Get Monday-Friday of current week
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const fridayEnd = new Date(weekStart);
  fridayEnd.setDate(weekStart.getDate() + 4);
  fridayEnd.setHours(23, 59, 59, 999);

  console.log(`Fetching calendar events from ${format(weekStart, 'MMM d')} to ${format(fridayEnd, 'MMM d')}`);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: weekStart.toISOString(),
    timeMax: fridayEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];

  return events
    .filter(event => event.status !== 'cancelled')
    .filter(event => event.visibility !== 'private' && event.visibility !== 'confidential')
    .map(event => {
      // Find my response status
      const selfAttendee = (event.attendees || []).find(a => a.self);
      const myResponseStatus = (selfAttendee?.responseStatus as CalendarEvent['myResponseStatus']) || 'unknown';

      return {
        id: event.id || '',
        title: event.summary || 'Untitled Meeting',
        description: event.description || undefined,
        start: new Date(event.start?.dateTime || event.start?.date || ''),
        end: new Date(event.end?.dateTime || event.end?.date || ''),
        attendees: (event.attendees || [])
          .filter(a => !a.self)
          .map(a => a.displayName || a.email || 'Unknown'),
        meetingLink: event.hangoutLink ||
          event.conferenceData?.entryPoints?.[0]?.uri ||
          extractMeetingLink(event.description),
        isRecurring: !!event.recurringEventId,
        myResponseStatus,
      };
    });
}

function extractMeetingLink(description?: string): string | undefined {
  if (!description) return undefined;

  // Look for common meeting URLs
  const patterns = [
    /https:\/\/[\w.-]+\.zoom\.us\/[^\s<]+/i,
    /https:\/\/meet\.google\.com\/[^\s<]+/i,
    /https:\/\/teams\.microsoft\.com\/[^\s<]+/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) return match[0];
  }

  return undefined;
}

// Helper to get a readable date range string
export function getWeekDateRange(): { start: string; end: string; display: string } {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const fridayEnd = new Date(weekStart);
  fridayEnd.setDate(weekStart.getDate() + 4);

  return {
    start: format(weekStart, 'yyyy-MM-dd'),
    end: format(fridayEnd, 'yyyy-MM-dd'),
    display: `${format(weekStart, 'MMM d')} - ${format(fridayEnd, 'MMM d, yyyy')}`,
  };
}
