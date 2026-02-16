import chalk from 'chalk';
import { Lead } from './types.js';

const stageColors: Record<string, (s: string) => string> = {
  cold: chalk.blue,
  warm: chalk.yellow,
  hot: chalk.red,
  proposal: chalk.magenta,
  won: chalk.green,
  lost: chalk.gray,
  lead: chalk.blue,
  demo: chalk.yellow,
  trial: chalk.cyan,
  negotiation: chalk.magenta,
  closed: chalk.green,
  churned: chalk.gray,
};

export function colorStage(stage: string): string {
  const fn = stageColors[stage] || chalk.white;
  return fn(stage.toUpperCase());
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function formatLeadRow(l: Lead): string {
  const id = chalk.dim(shortId(l.id));
  const stage = colorStage(l.stage);
  const value = l.value ? chalk.green(`$${l.value}`) : chalk.dim('—');
  const name = chalk.bold(l.name);
  const company = l.company ? chalk.dim(` @ ${l.company}`) : '';
  const tags = l.tags.length ? chalk.dim(` [${l.tags.join(', ')}]`) : '';
  return `${id}  ${stage.padEnd(20)}  ${value.padEnd(16)}  ${name}${company}${tags}`;
}

export function formatLeadDetail(l: Lead): string {
  const lines: string[] = [
    `${chalk.bold(l.name)} ${chalk.dim(`(${l.id})`)}`,
    '',
    `  Stage:     ${colorStage(l.stage)}`,
    `  Pipeline:  ${l.pipeline}`,
    `  Email:     ${l.email || chalk.dim('—')}`,
    `  Phone:     ${l.phone || chalk.dim('—')}`,
    `  Company:   ${l.company || chalk.dim('—')}`,
    `  Source:    ${l.source || chalk.dim('—')}`,
    `  Value:     ${l.value ? chalk.green(`$${l.value}`) : chalk.dim('—')}`,
    `  Score:     ${l.score}`,
    `  Tags:      ${l.tags.length ? l.tags.join(', ') : chalk.dim('none')}`,
    `  Follow-up: ${l.followUp || chalk.dim('none')}`,
    `  Created:   ${l.createdAt}`,
    `  Updated:   ${l.updatedAt}`,
  ];

  if (l.touches.length > 0) {
    lines.push('', chalk.bold('  Touches:'));
    for (const t of l.touches) {
      const type = chalk.cyan(t.type.padEnd(7));
      lines.push(`    ${chalk.dim(t.date.slice(0, 10))}  ${type}  ${t.note}`);
    }
  }

  return lines.join('\n');
}
