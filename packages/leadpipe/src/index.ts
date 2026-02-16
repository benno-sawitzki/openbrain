#!/usr/bin/env node
import { Command } from 'commander';
import { registerCommands } from './commands/index.js';

const program = new Command();
program
  .name('leadpipe')
  .description('CLI-first CRM pipeline. The Unix of Marketing.')
  .version('0.1.0')
  .option('--pipe <pipeline>', 'pipeline to use', 'default')
  .option('--json', 'output as JSON');

registerCommands(program);
program.parse();
