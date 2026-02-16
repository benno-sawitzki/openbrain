import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { isCloudMode, getClient } from '@openbrain/cli-client';
import { Post, Config, InboxItem } from './types';

const CQ_DIR = '.contentq';

export function getCqDir(): string {
  return path.resolve(process.cwd(), CQ_DIR);
}

export function ensureInitialized(): void {
  if (!fs.existsSync(getCqDir())) {
    console.error('Not initialized. Run: contentq init');
    process.exit(1);
  }
}

export async function readQueue(): Promise<Post[]> {
  if (isCloudMode()) return getClient().listContent();
  const p = path.join(getCqDir(), 'queue.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export async function writeQueue(posts: Post[]): Promise<void> {
  if (isCloudMode()) { await getClient().bulkWriteContent(posts); return; }
  fs.writeFileSync(path.join(getCqDir(), 'queue.json'), JSON.stringify(posts, null, 2));
}

export async function readHistory(): Promise<Post[]> {
  if (isCloudMode()) return [];
  const p = path.join(getCqDir(), 'history.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export async function writeHistory(posts: Post[]): Promise<void> {
  if (isCloudMode()) return;
  fs.writeFileSync(path.join(getCqDir(), 'history.json'), JSON.stringify(posts, null, 2));
}

export async function readConfig(): Promise<Config> {
  if (isCloudMode()) return getClient().getConfig('contentq');
  const p = path.join(getCqDir(), 'config.yaml');
  if (!fs.existsSync(p)) return { platforms: {} };
  return yaml.parse(fs.readFileSync(p, 'utf-8')) || { platforms: {} };
}

export async function writeConfig(config: Config): Promise<void> {
  if (isCloudMode()) { await getClient().writeConfig('contentq', config); return; }
  fs.writeFileSync(path.join(getCqDir(), 'config.yaml'), yaml.stringify(config));
}

export async function readInbox(): Promise<InboxItem[]> {
  if (isCloudMode()) return getClient().getInbox();
  const p = path.join(getCqDir(), 'inbox.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export async function writeInbox(items: InboxItem[]): Promise<void> {
  if (isCloudMode()) { await getClient().writeInbox(items); return; }
  fs.writeFileSync(path.join(getCqDir(), 'inbox.json'), JSON.stringify(items, null, 2));
}

export function ensureInboxDirs(): void {
  const dir = getCqDir();
  for (const sub of ['social', 'inspo', 'ideas', 'general']) {
    fs.mkdirSync(path.join(dir, 'inbox', sub), { recursive: true });
  }
}
