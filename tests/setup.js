import fs from 'node:fs';
import { configureMaps } from '../src/world/levels.js';
import * as catalog from '../levels/catalog.js';
export function readLevelFile(file) {
  return JSON.parse(fs.readFileSync(new URL('../levels/' + file, import.meta.url), 'utf8'));
}

// Node tests load authored maps from disk; browser startup supplies fetched maps.
configureMaps(
  Object.fromEntries(catalog.standard.map((file, index) => [index + 1, readLevelFile(file)])),
);
