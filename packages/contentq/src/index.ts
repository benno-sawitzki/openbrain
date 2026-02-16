#!/usr/bin/env node
import { Command } from 'commander';
import { setJsonMode } from './output';
import { initCommand } from './commands/init';
import { addCommand } from './commands/add';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { editCommand } from './commands/edit';
import { deleteCommand } from './commands/delete';
import { publishCommand } from './commands/publish';
import { scheduleCommand } from './commands/schedule';
import { statsCommand } from './commands/stats';
import { platformsCommand } from './commands/platforms';
import { historyCommand } from './commands/history';
import { inboxListCommand, inboxAddCommand, inboxShowCommand, inboxPromoteCommand, inboxDeleteCommand, inboxStatsCommand } from './commands/inbox';

const program = new Command();

program
  .name('contentq')
  .description('Content queue manager for marketing')
  .version('1.0.0')
  .option('--json', 'Output as JSON')
  .hook('preAction', (cmd) => {
    if (cmd.opts().json) setJsonMode(true);
  });

program.command('init')
  .description('Initialize .contentq/ in current directory')
  .option('--cloud', 'Configure cloud mode')
  .option('--url <url>', 'Open Brain API URL')
  .option('--key <key>', 'API key')
  .action(initCommand);

program.command('add [text]')
  .description('Add a post to the queue')
  .option('--from <file>', 'Read content from file')
  .option('-p, --platform <platform>', 'Target platform')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('--template <name>', 'Template name')
  .action(addCommand);

program.command('list')
  .description('List queued posts')
  .option('-s, --status <status>', 'Filter by status')
  .option('-p, --platform <platform>', 'Filter by platform')
  .action(listCommand);

program.command('show <id>')
  .description('Show post details')
  .action(showCommand);

program.command('edit <id> [text]')
  .description('Edit a queued post')
  .option('-p, --platform <platform>', 'Change platform')
  .option('-t, --tags <tags>', 'Update tags')
  .action(editCommand);

program.command('delete <id>')
  .description('Remove a post from queue')
  .action(deleteCommand);

program.command('publish [id]')
  .description('Publish a post or all pending')
  .option('--pending', 'Publish all due scheduled posts')
  .action(publishCommand);

program.command('schedule <id> <date>')
  .description('Schedule a post for later')
  .action(scheduleCommand);

program.command('stats')
  .description('Show queue statistics')
  .action(statsCommand);

program.command('platforms')
  .description('List configured platforms')
  .action(platformsCommand);

program.command('history')
  .description('Show published posts log')
  .action(historyCommand);

const inbox = program.command('inbox')
  .description('Manage media inbox')
  .option('--social', 'Filter by social type')
  .option('--inspo', 'Filter by inspiration')
  .option('--ideas', 'Filter by ideas')
  .option('--general', 'Filter by general')
  .option('--recent', 'Show last 5 items')
  .action((opts) => inboxListCommand(opts));

inbox.command('add [input]')
  .description('Add item to inbox')
  .option('--type <type>', 'Item type: social, inspo, idea, general', 'general')
  .option('--note <note>', 'Description or caption')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--url <url>', 'URL to save')
  .option('--source <source>', 'Source: whatsapp, cli, web', 'cli')
  .option('--title <title>', 'Title for the item')
  .action(inboxAddCommand);

inbox.command('show <id>')
  .description('Show full inbox item details')
  .action(inboxShowCommand);

inbox.command('promote <id>')
  .description('Promote inbox item to content queue draft')
  .action(inboxPromoteCommand);

inbox.command('delete <id>')
  .description('Delete inbox item')
  .action(inboxDeleteCommand);

inbox.command('stats')
  .description('Show inbox statistics')
  .action(inboxStatsCommand);

program.parse();
