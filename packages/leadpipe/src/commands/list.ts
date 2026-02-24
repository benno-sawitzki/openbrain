import { Command } from 'commander';
import { loadLeads } from '../store.js';
import { formatLeadRow } from '../format.js';

export function listCmd(program: Command): void {
  program
    .command('list')
    .description('List leads')
    .option('--stage <stage>', 'filter by stage')
    .option('--status <status>', 'filter by status (alias for --stage, supports comma-separated list)')
    .option('--tag <tag>')
    .option('--source <source>')
    .action(async (opts: any) => {
      const pipe = program.opts().pipe || 'default';
      let leads = (await loadLeads()).filter(l => l.pipeline === pipe);
      
      // Support --status as alias for --stage, with comma-separated values (case-insensitive)
      const statusFilter = opts.status || opts.stage;
      if (statusFilter) {
        const statuses = statusFilter.split(',').map((s: string) => s.trim().toLowerCase());
        leads = leads.filter(l => statuses.includes(l.stage.toLowerCase()));
      }
      
      if (opts.tag) leads = leads.filter(l => l.tags.includes(opts.tag));
      if (opts.source) leads = leads.filter(l => l.source === opts.source);

      if (program.opts().json) {
        console.log(JSON.stringify(leads, null, 2));
        return;
      }

      if (leads.length === 0) {
        console.log('No leads found.');
        return;
      }
      for (const l of leads) {
        console.log(formatLeadRow(l));
      }
    });
}
