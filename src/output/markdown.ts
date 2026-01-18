import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { format } from 'date-fns';
import { Draft515 } from '../synthesis/draft.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface MarkdownOutput {
  filePath: string;
}

export function writeDraftToMarkdown(draft: Draft515): MarkdownOutput {
  const draftsDir = join(__dirname, '..', '..', 'drafts');

  // Create drafts directory if it doesn't exist
  if (!existsSync(draftsDir)) {
    mkdirSync(draftsDir, { recursive: true });
  }

  const fileName = `${format(new Date(), 'yyyy-MM-dd')}.md`;
  const filePath = join(draftsDir, fileName);

  const content = formatDraftAsMarkdown(draft);
  writeFileSync(filePath, content, 'utf-8');

  console.log(`✅ Draft saved to: ${filePath}`);

  return { filePath };
}

function formatDraftAsMarkdown(draft: Draft515): string {
  const lines: string[] = [];

  lines.push(`# ${draft.date}`);
  lines.push('');
  lines.push('## :tldr: TLDR');
  lines.push('');
  lines.push(draft.tldr);
  lines.push('');
  lines.push('## ✅ What I did');
  lines.push('');

  for (const item of draft.whatIDid) {
    lines.push(`- ${item}`);
  }

  if (draft.meetingsWithoutNotes.length > 0) {
    lines.push('');
    lines.push('> ⚠️ **Meetings without Granola notes - please fill in:**');
    for (const meeting of draft.meetingsWithoutNotes) {
      lines.push(`> - ${meeting} - [Add details]`);
    }
  }

  lines.push('');
  lines.push('## 🧠 What I am thinking about');
  lines.push('');
  lines.push('<!-- Your reflections here -->');
  lines.push('');
  lines.push('## 🏗️ What I am prioritizing next week');
  lines.push('');

  for (const priority of draft.priorities) {
    lines.push(`- ${priority}`);
  }

  lines.push('');

  return lines.join('\n');
}
