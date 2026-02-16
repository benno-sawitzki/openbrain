import { Command } from 'commander';
import { loadLeads, saveLeads, findLead } from '../store.js';
import { shortId } from '../format.js';

export function touchCmd(program: Command): void {
  program
    .command('touch <id> <note>')
    .description('Log an interaction')
    .option('--type <type>', 'call|email|dm|meeting|note', 'note')
    .action(async (id: string, note: string, opts: any) => {
      const leads = await loadLeads();
      const lead = findLead(leads, id);
      if (!lead) { console.error('Lead not found.'); process.exit(1); }
      const now = new Date().toISOString();
      lead.touches.push({ date: now, note, type: opts.type });
      lead.updatedAt = now;
      await saveLeads(leads);
      if (program.opts().json) {
        console.log(JSON.stringify(lead, null, 2));
      } else {
        console.log(`Logged ${opts.type} for ${lead.name} (${shortId(lead.id)})`);
      }
    });
}
