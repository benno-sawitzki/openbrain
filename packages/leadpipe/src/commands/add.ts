import { Command } from 'commander';
import { v4 as uuid } from 'uuid';
import { loadLeads, saveLeads } from '../store.js';
import { Lead } from '../types.js';
import { shortId } from '../format.js';

export function addCmd(program: Command): void {
  program
    .command('add <name>')
    .description('Add a new lead')
    .option('--email <email>')
    .option('--company <company>')
    .option('--phone <phone>')
    .option('--source <source>')
    .option('--stage <stage>', '', 'cold')
    .option('--tags <tags>', 'comma-separated tags')
    .option('--value <value>', '', '0')
    .option('--note <note>', 'initial note')
    .action(async (name: string, opts: any) => {
      const pipe = program.opts().pipe || 'default';
      const now = new Date().toISOString();
      const lead: Lead = {
        id: uuid(),
        name,
        email: opts.email || null,
        company: opts.company || null,
        phone: opts.phone || null,
        source: opts.source || null,
        stage: opts.stage,
        value: Number(opts.value),
        score: 0,
        tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : [],
        pipeline: pipe,
        touches: [],
        followUp: null,
        createdAt: now,
        updatedAt: now,
      };

      if (opts.note) {
        lead.touches.push({ date: now, note: opts.note, type: 'note' });
      }

      const leads = await loadLeads();
      leads.push(lead);
      await saveLeads(leads);

      if (program.opts().json) {
        console.log(JSON.stringify(lead, null, 2));
      } else {
        console.log(`Added ${name} (${shortId(lead.id)})`);
      }
    });
}
