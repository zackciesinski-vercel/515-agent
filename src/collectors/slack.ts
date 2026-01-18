import { WebClient } from '@slack/web-api';
import { startOfWeek, format, fromUnixTime } from 'date-fns';
import { config } from '../config.js';

const slack = new WebClient(config.slack.token);

export interface SlackChannelActivity {
  channelId: string;
  channelName: string;
  messageCount: number;
  messages: SlackMessage[];
  mentions: string[];
}

export interface SlackMessage {
  text: string;
  timestamp: Date;
  threadTs?: string;
  isThreadReply: boolean;
}

export async function getActiveChannels(): Promise<SlackChannelActivity[]> {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const fridayEnd = new Date(weekStart);
  fridayEnd.setDate(weekStart.getDate() + 4);
  fridayEnd.setHours(23, 59, 59, 999);

  console.log(`Fetching Slack activity from ${format(weekStart, 'MMM d')} - ${format(fridayEnd, 'MMM d')}`);

  // Search for messages from the user this week
  const searchQuery = `from:<@${config.slack.userId}> after:${format(weekStart, 'yyyy-MM-dd')}`;

  const searchResult = await slack.search.messages({
    query: searchQuery,
    sort: 'timestamp',
    sort_dir: 'asc',
    count: 200,
  });

  if (!searchResult.messages?.matches) {
    console.log('No Slack messages found for this week');
    return [];
  }

  // Group messages by channel
  const channelMap = new Map<string, {
    channelId: string;
    channelName: string;
    messages: SlackMessage[];
    mentions: Set<string>;
  }>();

  for (const match of searchResult.messages.matches) {
    const channelId = match.channel?.id;
    const channelName = match.channel?.name || 'unknown';

    if (!channelId) continue;

    // Skip DMs (channel names starting with D or im)
    if (channelName.startsWith('im-') || channelId.startsWith('D')) continue;

    const timestamp = match.ts ? fromUnixTime(parseFloat(match.ts)) : new Date();

    // Only include messages within our date range
    if (timestamp < weekStart || timestamp > fridayEnd) continue;

    if (!channelMap.has(channelId)) {
      channelMap.set(channelId, {
        channelId,
        channelName,
        messages: [],
        mentions: new Set(),
      });
    }

    const channel = channelMap.get(channelId)!;

    channel.messages.push({
      text: match.text || '',
      timestamp,
      threadTs: match.thread_ts,
      isThreadReply: !!(match.thread_ts && match.thread_ts !== match.ts),
    });

    // Extract @mentions from the message
    const mentionMatches = (match.text || '').matchAll(/<@([A-Z0-9]+)>/g);
    for (const mentionMatch of mentionMatches) {
      channel.mentions.add(mentionMatch[1]);
    }
  }

  // Filter channels where message count > 1
  const activeChannels: SlackChannelActivity[] = [];

  for (const [, channel] of channelMap) {
    if (channel.messages.length > 1) {
      // Resolve user IDs to names
      const resolvedMentions = await resolveUserIds(Array.from(channel.mentions));

      activeChannels.push({
        channelId: channel.channelId,
        channelName: channel.channelName,
        messageCount: channel.messages.length,
        messages: channel.messages,
        mentions: resolvedMentions,
      });
    }
  }

  // Sort by message count (most active first)
  activeChannels.sort((a, b) => b.messageCount - a.messageCount);

  console.log(`Found ${activeChannels.length} active channels (where you posted 2+ messages)`);

  return activeChannels;
}

// Cache for user ID to name resolution
const userCache = new Map<string, string>();

async function resolveUserIds(userIds: string[]): Promise<string[]> {
  const names: string[] = [];

  for (const userId of userIds) {
    if (userCache.has(userId)) {
      names.push(userCache.get(userId)!);
      continue;
    }

    try {
      const result = await slack.users.info({ user: userId });
      const name = result.user?.real_name || result.user?.name || userId;
      userCache.set(userId, name);
      names.push(name);
    } catch {
      // If we can't resolve, just use the ID
      names.push(userId);
    }
  }

  return names;
}

// Helper to get channel info for internal channel references
export async function getChannelInfo(channelId: string): Promise<{ name: string; isPrivate: boolean } | null> {
  try {
    const result = await slack.conversations.info({ channel: channelId });
    return {
      name: result.channel?.name || 'unknown',
      isPrivate: result.channel?.is_private || false,
    };
  } catch {
    return null;
  }
}
