import { Command } from 'commander';
import { loadLeads, findLead } from '../store.js';
import { formatLeadDetail } from '../format.js';

export function showCmd(program: Command): void {
  program
    .command('show <id>')
    .description('Show lead details')
    .action(async (id: string) => {
      const lead = findLead(await loadLeads(), id);
      if (!lead) { console.error('Lead not found.'); process.exit(1); }
      if (program.opts().json) {
        console.log(JSON.stringify(lead, null, 2));
      } else {
        console.log(formatLeadDetail(lead));
      }
    });
}
