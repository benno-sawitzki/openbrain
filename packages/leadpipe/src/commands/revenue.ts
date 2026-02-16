import { Command } from 'commander';
import chalk from 'chalk';
import { loadLeads, loadConfig } from '../store.js';

export function revenueCmd(program: Command): void {
  program
    .command('revenue')
    .description('Pipeline value breakdown')
    .action(async () => {
      const pipe = program.opts().pipe || 'default';
      const leads = (await loadLeads()).filter(l => l.pipeline === pipe);
      const config = await loadConfig();
      const stages = config.pipelines[pipe]?.stages || [];

      const byStage: Record<string, number> = {};
      for (const s of stages) byStage[s] = 0;
      for (const l of leads) byStage[l.stage] = (byStage[l.stage] || 0) + l.value;
      const total = leads.reduce((s, l) => s + l.value, 0);

      if (program.opts().json) { console.log(JSON.stringify({ total, stages: byStage }, null, 2)); return; }

      console.log(chalk.bold('\nRevenue Pipeline:'));
      for (const s of stages) {
        const pct = total > 0 ? Math.round((byStage[s] / total) * 100) : 0;
        console.log(`  ${s.padEnd(12)} ${chalk.green('$' + String(byStage[s]).padStart(8))}  ${String(pct).padStart(3)}%`);
      }
      console.log(`  ${'TOTAL'.padEnd(12)} ${chalk.bold.green('$' + String(total).padStart(8))}`);
      console.log();
    });
}
