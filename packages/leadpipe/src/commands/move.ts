import { Command } from 'commander';
import { loadLeads, saveLeads, findLead } from '../store.js';
import { shortId, colorStage } from '../format.js';

export function moveCmd(program: Command): void {
  program
    .command('move <id>')
    .description('Move lead to a different stage')
    .requiredOption('--stage <stage>')
    .action(async (id: string, opts: any) => {
      const leads = await loadLeads();
      const lead = findLead(leads, id);
      if (!lead) { console.error('Lead not found.'); process.exit(1); }
      const old = lead.stage;
      lead.stage = opts.stage;
      lead.updatedAt = new Date().toISOString();
      lead.touches.push({ date: lead.updatedAt, note: `Moved from ${old} to ${opts.stage}`, type: 'note' });
      await saveLeads(leads);
      if (program.opts().json) {
        console.log(JSON.stringify(lead, null, 2));
      } else {
        console.log(`${lead.name}: ${colorStage(old)} → ${colorStage(opts.stage)}`);
      }
    });
}
