// Syntax-check every runtime and tooling module without running it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = [];
function collect(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const name = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) collect(name);
    else if (name.endsWith('.js')) files.push(name);
  }
}
for (const dir of ['src', 'levels', 'scripts']) collect(dir);
for (const file of files)
  execFileSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
console.log('Syntax OK: ' + files.length + ' files');
