import { Command } from 'commander';
import { loadLeads, saveLeads, findLead } from '../store.js';
import { shortId } from '../format.js';

export function editCmd(program: Command): void {
  program
    .command('edit <id>')
    .description('Edit a lead')
    .option('--name <name>')
    .option('--email <email>')
    .option('--company <company>')
    .option('--phone <phone>')
    .option('--source <source>')
    .option('--stage <stage>')
    .option('--tags <tags>')
    .option('--value <value>')
    .action(async (id: string, opts: any) => {
      const leads = await loadLeads();
      const lead = findLead(leads, id);
      if (!lead) { console.error('Lead not found.'); process.exit(1); }

      if (opts.name) lead.name = opts.name;
      if (opts.email) lead.email = opts.email;
      if (opts.company) lead.company = opts.company;
      if (opts.phone) lead.phone = opts.phone;
      if (opts.source) lead.source = opts.source;
      if (opts.stage) lead.stage = opts.stage;
      if (opts.tags) lead.tags = opts.tags.split(',').map((t: string) => t.trim());
      if (opts.value) lead.value = Number(opts.value);
      lead.updatedAt = new Date().toISOString();

      await saveLeads(leads);
      if (program.opts().json) {
        console.log(JSON.stringify(lead, null, 2));
      } else {
        console.log(`Updated ${lead.name} (${shortId(lead.id)})`);
      }
    });
}
