import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (existsSync('.dev.vars')) {
  for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
    const match = /^([^#=]+)=(.*)$/.exec(line.trim());
    if (match) process.env[match[1]] = match[2];
  }
}
const result = spawnSync('npx', ['wrangler', 'dev', '--config', 'wrangler.local.jsonc'], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 0);
