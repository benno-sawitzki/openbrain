import chalk from 'chalk';
import { Post } from './types';

let jsonMode = false;
export function setJsonMode(v: boolean) { jsonMode = v; }
export function isJsonMode() { return jsonMode; }

export function out(data: any) {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  }
}

const statusColors: Record<string, (s: string) => string> = {
  draft: chalk.gray,
  scheduled: chalk.yellow,
  published: chalk.green,
  failed: chalk.red,
};

export function formatPost(p: Post, short = false): string {
  const color = statusColors[p.status] || chalk.white;
  const id = chalk.dim(p.id.slice(0, 8));
  const status = color(p.status.padEnd(10));
  const platform = chalk.cyan(p.platform);
  const text = p.text.length > 60 ? p.text.slice(0, 57) + '...' : p.text;

  if (short) return `${id}  ${status}  ${platform}  ${text}`;

  const lines = [
    `${chalk.bold('ID:')}        ${p.id}`,
    `${chalk.bold('Status:')}    ${color(p.status)}`,
    `${chalk.bold('Platform:')}  ${platform}`,
    `${chalk.bold('Created:')}   ${p.createdAt}`,
  ];
  if (p.scheduledFor) lines.push(`${chalk.bold('Scheduled:')} ${p.scheduledFor}`);
  if (p.publishedAt) lines.push(`${chalk.bold('Published:')} ${p.publishedAt}`);
  if (p.tags.length) lines.push(`${chalk.bold('Tags:')}      ${p.tags.join(', ')}`);
  if (p.template) lines.push(`${chalk.bold('Template:')}  ${p.template}`);
  lines.push(`${chalk.bold('Text:')}\n${p.text}`);
  return lines.join('\n');
}
