import { Command } from 'commander';
import chalk from 'chalk';
import { loadLeads, findLead } from '../store.js';
import { colorStage, formatLeadDetail } from '../format.js';

export function contextCmd(program: Command): void {
  program
    .command('context <id>')
    .description('Rich context view for a lead')
    .action(async (id: string) => {
      const lead = findLead(await loadLeads(), id);
      if (!lead) { console.error('Lead not found.'); process.exit(1); }

      if (program.opts().json) { console.log(JSON.stringify(lead, null, 2)); return; }

      const daysInStage = Math.round((Date.now() - new Date(lead.updatedAt).getTime()) / 86400000);
      const lastTouch = lead.touches.length ? lead.touches[lead.touches.length - 1] : null;

      console.log(formatLeadDetail(lead));
      console.log();
      console.log(chalk.bold('  Context:'));
      console.log(`    Days in ${lead.stage}: ${daysInStage}`);
      console.log(`    Total touches: ${lead.touches.length}`);
      if (lastTouch) {
        console.log(`    Last touch: ${lastTouch.date.slice(0, 10)} (${lastTouch.type})`);
      }
      if (lead.followUp) {
        const daysUntil = Math.round((new Date(lead.followUp).getTime() - Date.now()) / 86400000);
        console.log(`    Follow-up: ${lead.followUp} (${daysUntil > 0 ? `in ${daysUntil} days` : chalk.red('OVERDUE')})`);
      }
      console.log();
    });
}
