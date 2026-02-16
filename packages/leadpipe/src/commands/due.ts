import { Command } from 'commander';
import { loadLeads } from '../store.js';
import { formatLeadRow } from '../format.js';

export function dueCmd(program: Command): void {
  program
    .command('due')
    .description('Leads with follow-ups due today or overdue')
    .action(async () => {
      const today = new Date().toISOString().slice(0, 10);
      const due = (await loadLeads()).filter(l => l.followUp && l.followUp.slice(0, 10) <= today);
      if (program.opts().json) { console.log(JSON.stringify(due, null, 2)); return; }
      if (due.length === 0) { console.log('No follow-ups due.'); return; }
      for (const l of due) console.log(formatLeadRow(l));
    });
}
