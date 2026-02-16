import { Command } from 'commander';
import chalk from 'chalk';
import { loadLeads, loadConfig } from '../store.js';

export function funnelCmd(program: Command): void {
  program
    .command('funnel')
    .description('Conversion rates between stages')
    .action(async () => {
      const pipe = program.opts().pipe || 'default';
      const leads = (await loadLeads()).filter(l => l.pipeline === pipe);
      const config = await loadConfig();
      const stages = config.pipelines[pipe]?.stages || [];

      const counts: Record<string, number> = {};
      for (const s of stages) counts[s] = 0;
      for (const l of leads) counts[l.stage] = (counts[l.stage] || 0) + 1;

      // Count leads that have passed through each stage (current or later)
      const passed: Record<string, number> = {};
      for (let i = 0; i < stages.length; i++) {
        passed[stages[i]] = 0;
        for (const l of leads) {
          const idx = stages.indexOf(l.stage);
          if (idx >= i) passed[stages[i]]++;
        }
      }

      if (program.opts().json) { console.log(JSON.stringify({ stages: passed }, null, 2)); return; }

      console.log(chalk.bold('\nFunnel:'));
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i];
        const pct = passed[stages[0]] > 0 ? Math.round((passed[s] / passed[stages[0]]) * 100) : 0;
        const bar = '█'.repeat(Math.max(1, Math.round(pct / 5)));
        console.log(`  ${s.padEnd(12)} ${String(passed[s]).padStart(3)} (${String(pct).padStart(3)}%)  ${chalk.dim(bar)}`);
      }
      console.log();
    });
}
