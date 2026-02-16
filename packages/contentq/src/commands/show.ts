import chalk from 'chalk';
import { ensureInitialized, readQueue } from '../store';
import { isJsonMode, out, formatPost } from '../output';

export async function showCommand(id: string) {
  ensureInitialized();
  const posts = await readQueue();
  const post = posts.find(p => p.id === id || p.id.startsWith(id));

  if (!post) {
    if (isJsonMode()) return out({ error: 'Post not found' });
    console.error(chalk.red(`Post not found: ${id}`));
    process.exit(1);
  }

  if (isJsonMode()) return out(post);
  console.log('\n' + formatPost(post) + '\n');
}
