import { Command } from 'commander';
import { stringify } from 'csv-stringify/sync';
import { loadLeads } from '../store.js';

export function exportCmd(program: Command): void {
  program
    .command('export')
    .description('Export leads')
    .option('--csv', 'export as CSV')
    .option('--stage <stage>', 'filter by stage')
    .action(async (opts: any) => {
      const pipe = program.opts().pipe || 'default';
      let leads = (await loadLeads()).filter(l => l.pipeline === pipe);
      if (opts.stage) leads = leads.filter(l => l.stage === opts.stage);

      if (opts.csv) {
        const rows = leads.map(l => ({
          id: l.id, name: l.name, email: l.email, company: l.company,
          phone: l.phone, source: l.source, stage: l.stage, value: l.value,
          score: l.score, tags: l.tags.join(','), pipeline: l.pipeline,
          followUp: l.followUp, createdAt: l.createdAt
        }));
        console.log(stringify(rows, { header: true }));
      } else {
        console.log(JSON.stringify(leads, null, 2));
      }
    });
}
