import * as fs from 'fs';
import { v4 as uuid } from 'uuid';
import chalk from 'chalk';
import { ensureInitialized, readQueue, writeQueue, readConfig } from '../store';
import { Post } from '../types';
import { isJsonMode, out } from '../output';

export async function addCommand(text: string | undefined, opts: { from?: string; platform?: string; tags?: string; template?: string }) {
  ensureInitialized();

  let content = text;
  if (opts.from) {
    if (!fs.existsSync(opts.from)) {
      if (isJsonMode()) return out({ success: false, error: `File not found: ${opts.from}` });
      console.error(chalk.red(`File not found: ${opts.from}`));
      process.exit(1);
    }
    content = fs.readFileSync(opts.from, 'utf-8').trim();
  }

  if (!content) {
    if (isJsonMode()) return out({ success: false, error: 'No content provided' });
    console.error(chalk.red('Provide text or use --from <file>'));
    process.exit(1);
  }

  const config = await readConfig();
  const platform = opts.platform || config.defaults?.platform || 'linkedin';
  const tags = opts.tags ? opts.tags.split(',').map(t => t.trim()) : [];

  const post: Post = {
    id: uuid(),
    text: content,
    platform,
    status: 'draft',
    createdAt: new Date().toISOString(),
    scheduledFor: null,
    publishedAt: null,
    publishResult: {},
    tags,
    template: opts.template || null,
  };

  const queue = await readQueue();
  queue.push(post);
  await writeQueue(queue);

  if (isJsonMode()) return out({ success: true, post });
  console.log(chalk.green(`✓ Added post ${chalk.dim(post.id.slice(0, 8))} [${platform}]`));
}
