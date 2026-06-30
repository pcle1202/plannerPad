#!/usr/bin/env node
'use strict';

const { execSync, spawnSync } = require('child_process');
const { existsSync, copyFileSync } = require('fs');
const { join } = require('path');
const http = require('http');

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..');

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
};

function step(msg)    { console.log(`\n${C.bold}${C.cyan}→${C.reset} ${msg}`); }
function ok(msg)      { console.log(`${C.green}✓${C.reset} ${msg}`); }
function warn(msg)    { console.log(`${C.yellow}!${C.reset} ${msg}`); }
function fail(msg)    { console.error(`\n${C.red}✗${C.reset} ${msg}\n`); process.exit(1); }

function run(cmd, cwd) {
  const result = spawnSync(cmd, {
    cwd: cwd || ROOT,
    shell: true,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    fail(`Command failed: ${cmd}`);
  }
}

function runSilent(cmd, cwd) {
  const result = spawnSync(cmd, {
    cwd: cwd || ROOT,
    shell: true,
    stdio: 'pipe',
  });
  return { ok: result.status === 0, stdout: (result.stdout || '').toString().trim() };
}

function poll(url, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      http.get(url, (res) => {
        // Any HTTP response means the server is up (even 404)
        res.resume();
        resolve();
      }).on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
        } else {
          setTimeout(attempt, 1000);
        }
      });
    }
    attempt();
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}PlannerPad${C.reset} — starting up\n`);

  // 1. Install server dependencies
  step('Checking dependencies...');
  if (!existsSync(join(ROOT, 'server', 'node_modules'))) {
    console.log('  Installing server dependencies...');
    run('npm install', join(ROOT, 'server'));
    ok('Server dependencies installed');
  } else {
    ok('Server dependencies already installed');
  }

  // 2. Install client dependencies
  if (!existsSync(join(ROOT, 'client', 'node_modules'))) {
    console.log('  Installing client dependencies...');
    run('npm install', join(ROOT, 'client'));
    ok('Client dependencies installed');
  } else {
    ok('Client dependencies already installed');
  }

  // 3. Check for .env file in server/
  step('Checking environment...');
  const envPath     = join(ROOT, 'server', '.env');
  const examplePath = join(ROOT, 'server', '.env.example');

  if (!existsSync(envPath)) {
    if (existsSync(examplePath)) {
      copyFileSync(examplePath, envPath);
      warn(`No server/.env found — copied from server/.env.example.`);
      warn(`Review ${envPath} before running in production.`);
    } else {
      warn(`No server/.env found and no server/.env.example to copy from.`);
      warn(`The server may fail to connect to the database.`);
    }
  } else {
    ok('Environment file found (server/.env)');
  }

  // 4. Check Docker is installed and running
  step('Checking Docker...');

  const installed = runSilent('docker --version');
  if (!installed.ok) {
    fail(
      'Docker is not installed.\n\n' +
      '  Install Docker Desktop:  https://www.docker.com/products/docker-desktop\n' +
      '  Then re-run: npm start'
    );
  }

  const running = runSilent('docker info');
  if (!running.ok) {
    fail(
      'Docker is installed but not running.\n\n' +
      '  • Mac / Windows: open Docker Desktop from your Applications and wait for it to start.\n' +
      '  • Linux:         run:  sudo systemctl start docker\n\n' +
      '  Then re-run: npm start'
    );
  }

  ok('Docker is running');

  // 5. Start containers
  step('Starting Docker containers...');
  run('docker compose up --build -d');
  ok('Containers started');

  // 6. Wait for the backend server
  step('Waiting for server to be ready...');
  try {
    await poll('http://localhost:1337/api/rooms/by-slug/__ping__', 60000);
    ok('Server is ready');
  } catch {
    fail(
      'Server did not respond within 60 seconds.\n\n' +
      '  Check logs with:  docker compose logs server'
    );
  }

  // 7. Wait for the frontend (nginx)
  step('Waiting for app to be ready...');
  try {
    await poll('http://localhost', 30000);
    ok('App is ready');
  } catch {
    fail(
      'App did not respond within 30 seconds.\n\n' +
      '  Check logs with:  docker compose logs client'
    );
  }

  // 8. Done
  console.log(`
${C.bold}${C.green}PlannerPad is ready!${C.reset}

  ${C.bold}App${C.reset}     →  ${C.cyan}http://localhost${C.reset}
  ${C.bold}API${C.reset}     →  ${C.cyan}http://localhost/api${C.reset}
  ${C.bold}Server${C.reset}  →  ${C.cyan}http://localhost:1337${C.reset}

  Logs:  ${C.bold}docker compose logs -f${C.reset}
  Stop:  ${C.bold}npm stop${C.reset}
`);
}

main().catch((err) => {
  fail(err.message || String(err));
});
