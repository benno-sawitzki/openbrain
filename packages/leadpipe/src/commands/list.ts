import { Command } from 'commander';
import { loadLeads } from '../store.js';
import { formatLeadRow } from '../format.js';

export function listCmd(program: Command): void {
  program
    .command('list')
    .description('List leads')
    .option('--stage <stage>')
    .option('--tag <tag>')
    .option('--source <source>')
    .action(async (opts: any) => {
      const pipe = program.opts().pipe || 'default';
      let leads = (await loadLeads()).filter(l => l.pipeline === pipe);
      if (opts.stage) leads = leads.filter(l => l.stage === opts.stage);
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
