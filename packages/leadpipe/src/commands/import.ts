import { Command } from 'commander';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { v4 as uuid } from 'uuid';
import { loadLeads, saveLeads, loadConfig } from '../store.js';
import { Lead } from '../types.js';

export function importCmd(program: Command): void {
  program
    .command('import')
    .description('Import leads from CSV')
    .requiredOption('--csv <file>', 'CSV file path')
    .action(async (opts: any) => {
      const config = await loadConfig();
      const mapping = config.csv.mapping;
      const raw = fs.readFileSync(opts.csv, 'utf-8');
      const records = parse(raw, { columns: true, skip_empty_lines: true });
      const leads = await loadLeads();
      const pipe = program.opts().pipe || 'default';
      let count = 0;

      for (const row of records) {
        const now = new Date().toISOString();
        const lead: Lead = {
          id: uuid(),
          name: row[mapping.name] || 'Unknown',
          email: row[mapping.email] || null,
          company: row[mapping.company] || null,
          phone: row[mapping.phone || 'Phone'] || null,
          source: row[mapping.source || 'Source'] || null,
          stage: 'cold',
          value: Number(row[mapping.value || 'Value']) || 0,
          score: 0,
          tags: [],
          pipeline: pipe,
          touches: [],
          followUp: null,
          createdAt: now,
          updatedAt: now,
        };
        leads.push(lead);
        count++;
      }

      await saveLeads(leads);
      if (program.opts().json) {
        console.log(JSON.stringify({ imported: count }));
      } else {
        console.log(`Imported ${count} leads.`);
      }
    });
}
