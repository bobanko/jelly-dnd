import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Version label shown in the menu corner: Kyiv build time plus the short commit hash.
export function buildVersion(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  let label = `build: ${parts.year}-${parts.month}-${parts.day}_${parts.hour}:${parts.minute}`;
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (commit) label += ' · ' + commit;
  } catch {} // No git: the date alone still identifies the build.
  return label;
}

// `node scripts/build-version.js` writes the metadata file for a deploy.
if (import.meta.filename === path.resolve(process.argv[1] ?? '')) {
  const file = path.resolve(import.meta.dirname, '..', 'build-version.json');
  const version = buildVersion();
  fs.writeFileSync(file, JSON.stringify({ version }) + '\n');
  console.log('Version ' + version);
}
