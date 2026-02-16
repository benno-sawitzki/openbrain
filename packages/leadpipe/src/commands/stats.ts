import { Command } from 'commander';
import chalk from 'chalk';
import { loadLeads, loadConfig } from '../store.js';

export function statsCmd(program: Command): void {
  program
    .command('stats')
    .description('Pipeline overview')
    .action(async () => {
      const pipe = program.opts().pipe || 'default';
      const leads = (await loadLeads()).filter(l => l.pipeline === pipe);
      const config = await loadConfig();
      const stages = config.pipelines[pipe]?.stages || [];

      const byStage: Record<string, { count: number; value: number }> = {};
      for (const s of stages) byStage[s] = { count: 0, value: 0 };
      for (const l of leads) {
        if (!byStage[l.stage]) byStage[l.stage] = { count: 0, value: 0 };
        byStage[l.stage].count++;
        byStage[l.stage].value += l.value;
      }

      const totalValue = leads.reduce((s, l) => s + l.value, 0);

      if (program.opts().json) {
        console.log(JSON.stringify({ total: leads.length, totalValue, stages: byStage }, null, 2));
        return;
      }

      console.log(chalk.bold(`\nPipeline: ${pipe}`));
      console.log(`Total leads: ${leads.length}  |  Total value: ${chalk.green('$' + totalValue)}\n`);
      for (const [stage, data] of Object.entries(byStage)) {
        const bar = '█'.repeat(data.count);
        console.log(`  ${stage.padEnd(12)} ${String(data.count).padStart(3)}  ${chalk.green('$' + data.value)}  ${chalk.dim(bar)}`);
      }
      console.log();
    });
}
