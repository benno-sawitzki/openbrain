import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import chalk from 'chalk';
import { ensureInitialized, readInbox, writeInbox, readQueue, writeQueue, getCqDir, ensureInboxDirs } from '../store';
import { InboxItem, InboxType, Post } from '../types';
import { isJsonMode, out } from '../output';

const TYPE_EMOJI: Record<InboxType, string> = {
  social: '📱',
  inspo: '💡',
  idea: '💭',
  general: '📥',
};

const TYPE_FOLDER: Record<InboxType, string> = {
  social: 'social',
  inspo: 'inspo',
  idea: 'ideas',
  general: 'general',
};

function preview(item: InboxItem): string {
  if (item.title) return item.title;
  if (item.note) return item.note.length > 60 ? item.note.slice(0, 57) + '...' : item.note;
  if (item.text) return item.text.length > 60 ? item.text.slice(0, 57) + '...' : item.text;
  if (item.url) return item.url;
  if (item.media) return path.basename(item.media);
  return '(empty)';
}

function formatItem(item: InboxItem): string {
  const id = chalk.dim(item.id.slice(0, 8));
  const emoji = TYPE_EMOJI[item.type];
  const date = chalk.dim(item.createdAt.slice(0, 10));
  const tags = item.tags.length ? chalk.cyan(item.tags.join(', ')) : '';
  const promoted = item.promoted ? chalk.yellow(' [promoted]') : '';
  return `${id}  ${emoji} ${preview(item)}  ${date}  ${tags}${promoted}`;
}

function formatItemFull(item: InboxItem): string {
  const lines = [
    `${chalk.bold('ID:')}        ${item.id}`,
    `${chalk.bold('Type:')}      ${TYPE_EMOJI[item.type]} ${item.type}`,
    `${chalk.bold('Created:')}   ${item.createdAt}`,
    `${chalk.bold('Source:')}    ${item.source}`,
  ];
  if (item.title) lines.push(`${chalk.bold('Title:')}     ${item.title}`);
  if (item.note) lines.push(`${chalk.bold('Note:')}      ${item.note}`);
  if (item.media) lines.push(`${chalk.bold('Media:')}     ${item.media}`);
  if (item.mediaType) lines.push(`${chalk.bold('Media Type:')} ${item.mediaType}`);
  if (item.url) lines.push(`${chalk.bold('URL:')}       ${item.url}`);
  if (item.text) lines.push(`${chalk.bold('Text:')}\n${item.text}`);
  if (item.tags.length) lines.push(`${chalk.bold('Tags:')}      ${item.tags.join(', ')}`);
  if (item.promoted) lines.push(`${chalk.bold('Promoted:')}  → ${item.promotedTo || 'yes'}`);
  return lines.join('\n');
}

export async function inboxListCommand(opts: { social?: boolean; inspo?: boolean; ideas?: boolean; general?: boolean; recent?: boolean }) {
  ensureInitialized();
  let items = await readInbox();

  if (opts.social) items = items.filter(i => i.type === 'social');
  else if (opts.inspo) items = items.filter(i => i.type === 'inspo');
  else if (opts.ideas) items = items.filter(i => i.type === 'idea');
  else if (opts.general) items = items.filter(i => i.type === 'general');

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (opts.recent) items = items.slice(0, 5);

  if (isJsonMode()) return out(items);

  if (!items.length) {
    console.log(chalk.dim('No inbox items'));
    return;
  }
  items.forEach(i => console.log(formatItem(i)));
}

export async function inboxAddCommand(input: string | undefined, opts: { type?: string; note?: string; tags?: string; url?: string; source?: string; title?: string }) {
  ensureInitialized();
  ensureInboxDirs();

  const type = (opts.type || 'general') as InboxType;
  if (!['social', 'inspo', 'idea', 'general'].includes(type)) {
    if (isJsonMode()) return out({ success: false, error: `Invalid type: ${type}` });
    console.error(chalk.red(`Invalid type: ${type}. Use: social, inspo, idea, general`));
    process.exit(1);
  }

  const tags = opts.tags ? opts.tags.split(',').map(t => t.trim()) : [];
  const now = new Date();
  const ts = now.toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '_');

  const item: InboxItem = {
    id: uuid(),
    type,
    title: opts.title || null,
    note: opts.note || null,
    media: null,
    mediaType: null,
    url: opts.url || null,
    text: null,
    tags,
    promoted: false,
    promotedTo: null,
    createdAt: now.toISOString(),
    source: opts.source || 'cli',
  };

  // Check if input is a file
  if (input && fs.existsSync(input)) {
    const ext = path.extname(input).toLowerCase();
    const basename = `${ts}_${path.basename(input)}`;
    const destDir = path.join(getCqDir(), 'inbox', TYPE_FOLDER[type]);
    const dest = path.join(destDir, basename);
    fs.copyFileSync(input, dest);
    item.media = `inbox/${TYPE_FOLDER[type]}/${basename}`;

    const mimeMap: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4',
      '.txt': 'text', '.md': 'text',
    };
    item.mediaType = mimeMap[ext] || 'application/octet-stream';
    if (!item.title) item.title = path.basename(input, ext);
  } else if (input) {
    // Text input
    item.text = input;
    if (!item.title) item.title = input.length > 50 ? input.slice(0, 47) + '...' : input;
  }

  if (opts.url && !item.title) {
    item.title = opts.url;
    item.mediaType = 'url';
  }

  const inbox = await readInbox();
  inbox.push(item);
  await writeInbox(inbox);

  if (isJsonMode()) return out({ success: true, item });
  console.log(chalk.green(`✓ Added to inbox ${chalk.dim(item.id.slice(0, 8))} [${TYPE_EMOJI[type]} ${type}]`));
}

export async function inboxShowCommand(id: string) {
  ensureInitialized();
  const items = await readInbox();
  const item = items.find(i => i.id === id || i.id.startsWith(id));

  if (!item) {
    if (isJsonMode()) return out({ success: false, error: 'Not found' });
    console.error(chalk.red('Inbox item not found'));
    process.exit(1);
  }

  if (isJsonMode()) return out(item);
  console.log(formatItemFull(item));
}

export async function inboxPromoteCommand(id: string) {
  ensureInitialized();
  const inbox = await readInbox();
  const idx = inbox.findIndex(i => i.id === id || i.id.startsWith(id));

  if (idx === -1) {
    if (isJsonMode()) return out({ success: false, error: 'Not found' });
    console.error(chalk.red('Inbox item not found'));
    process.exit(1);
  }

  const item = inbox[idx];
  const post: Post = {
    id: uuid(),
    text: item.text || item.note || item.title || '',
    platform: 'linkedin',
    status: 'draft',
    createdAt: new Date().toISOString(),
    scheduledFor: null,
    publishedAt: null,
    publishResult: {},
    tags: [...item.tags],
    template: null,
  };

  const queue = await readQueue();
  queue.push(post);
  await writeQueue(queue);

  item.promoted = true;
  item.promotedTo = post.id;
  await writeInbox(inbox);

  if (isJsonMode()) return out({ success: true, item, post });
  console.log(chalk.green(`✓ Promoted to draft ${chalk.dim(post.id.slice(0, 8))}`));
}

export async function inboxDeleteCommand(id: string) {
  ensureInitialized();
  const inbox = await readInbox();
  const idx = inbox.findIndex(i => i.id === id || i.id.startsWith(id));

  if (idx === -1) {
    if (isJsonMode()) return out({ success: false, error: 'Not found' });
    console.error(chalk.red('Inbox item not found'));
    process.exit(1);
  }

  const item = inbox.splice(idx, 1)[0];
  await writeInbox(inbox);

  if (isJsonMode()) return out({ success: true, deleted: item.id });
  console.log(chalk.green(`✓ Deleted ${chalk.dim(item.id.slice(0, 8))}`));
}

export async function inboxStatsCommand() {
  ensureInitialized();
  const items = await readInbox();

  const counts: Record<string, number> = { social: 0, inspo: 0, idea: 0, general: 0 };
  items.forEach(i => { counts[i.type] = (counts[i.type] || 0) + 1; });
  const promoted = items.filter(i => i.promoted).length;

  if (isJsonMode()) return out({ total: items.length, counts, promoted });

  console.log(chalk.bold(`Inbox: ${items.length} items`));
  console.log(`  📱 Social:  ${counts.social}`);
  console.log(`  💡 Inspo:   ${counts.inspo}`);
  console.log(`  💭 Ideas:   ${counts.idea}`);
  console.log(`  📥 General: ${counts.general}`);
  console.log(`  ✅ Promoted: ${promoted}`);
}
