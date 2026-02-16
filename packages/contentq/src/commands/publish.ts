import chalk from 'chalk';
import { ensureInitialized, readQueue, writeQueue, readHistory, writeHistory, readConfig } from '../store';
import { getAdapter } from '../adapters';
import { Post } from '../types';
import { isJsonMode, out } from '../output';

async function publishPost(post: Post, config: any): Promise<Post> {
  const platformConfig = config.platforms?.[post.platform];
  if (!platformConfig) {
    post.status = 'failed';
    post.publishResult = { error: `No config for platform: ${post.platform}` };
    return post;
  }

  const adapter = getAdapter(platformConfig.adapter || post.platform);
  if (!adapter) {
    post.status = 'failed';
    post.publishResult = { error: `No adapter for: ${platformConfig.adapter || post.platform}` };
    return post;
  }

  const result = await adapter.publish(post, platformConfig);
  if (result.success) {
    post.status = 'published';
    post.publishedAt = new Date().toISOString();
  } else {
    post.status = 'failed';
  }
  post.publishResult = result;
  return post;
}

export async function publishCommand(id: string | undefined, opts: { pending?: boolean }) {
  ensureInitialized();
  const config = await readConfig();
  const queue = await readQueue();
  const history = await readHistory();

  if (opts.pending) {
    const now = new Date();
    const due = queue.filter(p => p.status === 'scheduled' && p.scheduledFor && new Date(p.scheduledFor) <= now);

    if (!due.length) {
      if (isJsonMode()) return out({ published: 0 });
      console.log(chalk.dim('No pending posts to publish'));
      return;
    }

    const results = [];
    for (const post of due) {
      await publishPost(post, config);
      if (post.status === 'published') {
        history.push(post);
        results.push({ id: post.id, success: true });
        if (!isJsonMode()) console.log(chalk.green(`✓ Published ${chalk.dim(post.id.slice(0, 8))}`));
      } else {
        results.push({ id: post.id, success: false, error: post.publishResult.error });
        if (!isJsonMode()) console.log(chalk.red(`✗ Failed ${chalk.dim(post.id.slice(0, 8))}: ${post.publishResult.error}`));
      }
    }

    const remaining = queue.filter(p => p.status !== 'published');
    await writeQueue(remaining);
    await writeHistory(history);
    if (isJsonMode()) out({ published: results.filter(r => r.success).length, results });
    return;
  }

  if (!id) {
    if (isJsonMode()) return out({ success: false, error: 'Provide post ID or --pending' });
    console.error(chalk.red('Provide a post ID or use --pending'));
    process.exit(1);
  }

  const idx = queue.findIndex(p => p.id === id || p.id.startsWith(id));
  if (idx === -1) {
    if (isJsonMode()) return out({ success: false, error: 'Post not found' });
    console.error(chalk.red(`Post not found: ${id}`));
    process.exit(1);
  }

  await publishPost(queue[idx], config);
  if (queue[idx].status === 'published') {
    history.push(queue[idx]);
    queue.splice(idx, 1);
    await writeQueue(queue);
    await writeHistory(history);
    if (isJsonMode()) return out({ success: true, post: history[history.length - 1] });
    console.log(chalk.green(`✓ Published!`));
  } else {
    await writeQueue(queue);
    if (isJsonMode()) return out({ success: false, error: queue[idx].publishResult.error });
    console.log(chalk.red(`✗ Failed: ${queue[idx].publishResult.error}`));
  }
}
