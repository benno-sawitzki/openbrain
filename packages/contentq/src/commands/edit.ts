import chalk from 'chalk';
import { ensureInitialized, readQueue, writeQueue } from '../store';
import { isJsonMode, out } from '../output';

export async function editCommand(id: string, text: string, opts: { platform?: string; tags?: string }) {
  ensureInitialized();
  const posts = await readQueue();
  const idx = posts.findIndex(p => p.id === id || p.id.startsWith(id));

  if (idx === -1) {
    if (isJsonMode()) return out({ success: false, error: 'Post not found' });
    console.error(chalk.red(`Post not found: ${id}`));
    process.exit(1);
  }

  if (text) posts[idx].text = text;
  if (opts.platform) posts[idx].platform = opts.platform;
  if (opts.tags) posts[idx].tags = opts.tags.split(',').map(t => t.trim());
  await writeQueue(posts);

  if (isJsonMode()) return out({ success: true, post: posts[idx] });
  console.log(chalk.green(`✓ Updated post ${chalk.dim(posts[idx].id.slice(0, 8))}`));
}
