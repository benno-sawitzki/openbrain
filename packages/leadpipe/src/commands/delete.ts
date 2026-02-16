import { Command } from 'commander';
import { loadLeads, saveLeads } from '../store.js';
import { shortId } from '../format.js';

export function deleteCmd(program: Command): void {
  program
    .command('delete <id>')
    .description('Delete a lead')
    .action(async (id: string) => {
      const leads = await loadLeads();
      const idx = leads.findIndex(l => l.id.startsWith(id));
      if (idx === -1) { console.error('Lead not found.'); process.exit(1); }
      const [removed] = leads.splice(idx, 1);
      await saveLeads(leads);
      if (program.opts().json) {
        console.log(JSON.stringify(removed, null, 2));
      } else {
        console.log(`Deleted ${removed.name} (${shortId(removed.id)})`);
      }
    });
}
