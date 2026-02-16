import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { getTemplatesDir, loadLeads, findLead } from '../store.js';

export function templateCmd(program: Command): void {
  const cmd = program.command('template').description('Manage templates');

  cmd.command('list').description('List templates').action(() => {
    const dir = getTemplatesDir();
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    if (program.opts().json) { console.log(JSON.stringify(files)); return; }
    for (const f of files) console.log(`  ${f.replace('.md', '')}`);
  });

  cmd.command('show <name>').description('Preview template').action((name: string) => {
    const file = path.join(getTemplatesDir(), `${name}.md`);
    if (!fs.existsSync(file)) { console.error('Template not found.'); process.exit(1); }
    console.log(fs.readFileSync(file, 'utf-8'));
  });

  cmd.command('use <name> <id>').description('Render template with lead data').action(async (name: string, id: string) => {
    const file = path.join(getTemplatesDir(), `${name}.md`);
    if (!fs.existsSync(file)) { console.error('Template not found.'); process.exit(1); }
    const lead = findLead(await loadLeads(), id);
    if (!lead) { console.error('Lead not found.'); process.exit(1); }
    let content = fs.readFileSync(file, 'utf-8');
    content = content.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => {
      return (lead as any)[key]?.toString() || `{{${key}}}`;
    });
    console.log(content);
  });
}
