import { Command } from 'commander';
import { loadLeads, loadConfig } from '../store.js';
import { formatLeadRow } from '../format.js';

export function staleCmd(program: Command): void {
  program
    .command('stale')
    .description('Leads with no recent touches')
    .option('--days <days>', 'stale threshold')
    .action(async (opts: any) => {
      const config = await loadConfig();
      const days = Number(opts.days) || config.stale.days;
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const stale = (await loadLeads()).filter(l => {
        if (['won', 'lost', 'closed', 'churned'].includes(l.stage)) return false;
        const lastTouch = l.touches.length ? l.touches[l.touches.length - 1].date : l.createdAt;
        return lastTouch < cutoff;
      });
      if (program.opts().json) { console.log(JSON.stringify(stale, null, 2)); return; }
      if (stale.length === 0) { console.log('No stale leads.'); return; }
      console.log(`Stale (>${days} days):`);
      for (const l of stale) console.log(formatLeadRow(l));
    });
}
