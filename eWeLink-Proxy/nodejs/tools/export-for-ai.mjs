#!/usr/bin/env node
// export-for-ai.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDependencyTree } from './app-tree.mjs'; // reuse your existing buildDependencyTree

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printForAI(treeMap) {
  // Sort files alphabetically by relative path
  const files = Array.from(treeMap.values())
    .sort((a, b) => a.relative.localeCompare(b.relative));

  for (const node of files) {
    try {
      const code = fs.readFileSync(node.file, 'utf8');
      console.log(`=== ${node.relative} ===\n${code}\n`);
    } catch (err) {
      console.warn(`Warning: Could not read ${node.relative}`);
    }
  }
}

// ---------- MAIN ----------
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: ./export-for-ai.mjs <main-file.js>');
    process.exit(1);
  }

  const entryFile = path.resolve(args[0]);
  if (!fs.existsSync(entryFile)) {
    console.error(`Error: File not found: ${entryFile}`);
    process.exit(1);
  }

  const { tree } = buildDependencyTree(entryFile, process.cwd());

  printForAI(tree);
}

main();

