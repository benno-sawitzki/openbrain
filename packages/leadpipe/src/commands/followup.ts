import { Command } from 'commander';
import { loadLeads, saveLeads, findLead } from '../store.js';
import { shortId } from '../format.js';

export function followUpCmd(program: Command): void {
  program
    .command('follow-up <id> <date>')
    .description('Set follow-up date')
    .action(async (id: string, date: string) => {
      const leads = await loadLeads();
      const lead = findLead(leads, id);
      if (!lead) { console.error('Lead not found.'); process.exit(1); }
      lead.followUp = date;
      lead.updatedAt = new Date().toISOString();
      await saveLeads(leads);
      if (program.opts().json) {
        console.log(JSON.stringify(lead, null, 2));
      } else {
        console.log(`Follow-up set for ${lead.name}: ${date}`);
      }
    });
}
