#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const { join } = require('path');

const ROOT = join(__dirname, '..');

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
};

function fail(msg) { console.error(`\n${C.red}✗${C.reset} ${msg}\n`); process.exit(1); }

console.log(`\n${C.bold}${C.cyan}→${C.reset} Stopping PlannerPad...\n`);

const result = spawnSync('docker compose down', {
  cwd: ROOT,
  shell: true,
  stdio: 'inherit',
});

if (result.status !== 0) {
  fail('docker compose down failed. Is Docker running?');
}

console.log(`
${C.green}✓${C.reset} All containers stopped.

  Data is preserved in the ${C.bold}pg_data${C.reset} Docker volume.
  To also delete all data: ${C.bold}docker compose down -v${C.reset}
`);
