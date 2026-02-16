import { Command } from 'commander';
import { loadLeads } from '../store.js';
import { formatLeadRow } from '../format.js';

export function searchCmd(program: Command): void {
  program
    .command('search <query>')
    .description('Search leads')
    .action(async (query: string) => {
      const q = query.toLowerCase();
      const results = (await loadLeads()).filter(l =>
        l.name.toLowerCase().includes(q) ||
        (l.company || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        l.tags.some(t => t.toLowerCase().includes(q)) ||
        l.touches.some(t => t.note.toLowerCase().includes(q))
      );

      if (program.opts().json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }
      if (results.length === 0) { console.log('No matches.'); return; }
      for (const l of results) console.log(formatLeadRow(l));
    });
}
