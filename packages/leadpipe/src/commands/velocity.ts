import { Command } from 'commander';
import chalk from 'chalk';
import { loadLeads, loadConfig } from '../store.js';

export function velocityCmd(program: Command): void {
  program
    .command('velocity')
    .description('Average days per stage')
    .action(async () => {
      const pipe = program.opts().pipe || 'default';
      const leads = (await loadLeads()).filter(l => l.pipeline === pipe);
      const config = await loadConfig();
      const stages = config.pipelines[pipe]?.stages || [];

      // For each lead, find stage transitions in touches
      const stageDays: Record<string, number[]> = {};
      for (const s of stages) stageDays[s] = [];

      for (const lead of leads) {
        // Current stage duration
        const daysSince = (Date.now() - new Date(lead.updatedAt).getTime()) / 86400000;
        stageDays[lead.stage]?.push(daysSince);
      }

      if (program.opts().json) {
        const avg: Record<string, number> = {};
        for (const [s, days] of Object.entries(stageDays)) {
          avg[s] = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length * 10) / 10 : 0;
        }
        console.log(JSON.stringify(avg, null, 2));
        return;
      }

      console.log(chalk.bold('\nVelocity (avg days in current stage):'));
      for (const s of stages) {
        const days = stageDays[s];
        const avg = days.length ? (days.reduce((a, b) => a + b, 0) / days.length).toFixed(1) : '—';
        console.log(`  ${s.padEnd(12)} ${String(avg).padStart(6)} days  (${days.length} leads)`);
      }
      console.log();
    });
}
