#!/usr/bin/env node
// app-tree.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Core Node.js modules (to filter out)
const CORE_MODULES = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http',
  'https', 'http2', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'timers', 'tls', 'trace_events', 'tty', 'url', 'util',
  'v8', 'vm', 'worker_threads', 'zlib',
]);

function isCoreModule(id) {
  return CORE_MODULES.has(id) || id.startsWith('node:');
}

// Try file extensions and directories
function tryExtensions(filePath) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;

  const exts = ['.js', '.mjs', '.cjs', '.json', '.node'];
  for (const ext of exts) {
    const candidate = filePath + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const pkgJson = path.join(filePath, 'package.json');
    if (fs.existsSync(pkgJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
        const main = pkg.main || 'index.js';
        const mainPath = path.join(filePath, main);
        const resolvedMain = tryExtensions(mainPath);
        if (resolvedMain) return resolvedMain;
      } catch {}
    }
    return tryExtensions(path.join(filePath, 'index'));
  }

  return null;
}

// Resolve import/require paths
function resolveRequirePath(baseDir, reqPath) {
  if (reqPath.startsWith('./') || reqPath.startsWith('../') || reqPath === '.' || reqPath === '..') {
    const resolved = path.resolve(baseDir, reqPath);
    return tryExtensions(resolved);
  }

  if (path.isAbsolute(reqPath)) return tryExtensions(reqPath);

  try {
    return require.resolve(reqPath, { paths: [baseDir] });
  } catch {
    return null;
  }
}

// Extract dependencies from JS/ESM
function extractRequires(code, filePath) {
  const requires = new Set();
  const baseDir = path.dirname(filePath);

  try {
    const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });

    walk.simple(ast, {
      ImportDeclaration(node) {
        const reqPath = node.source.value;
        if (!isCoreModule(reqPath) && !reqPath.includes('node_modules')) {
          const resolved = resolveRequirePath(baseDir, reqPath);
          if (resolved) requires.add(resolved);
        }
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
          const arg = node.arguments[0];
          if (arg && (arg.type === 'Literal' || arg.type === 'StringLiteral')) {
            const reqPath = arg.value;
            if (!isCoreModule(reqPath) && !reqPath.includes('node_modules')) {
              const resolved = resolveRequirePath(baseDir, reqPath);
              if (resolved) requires.add(resolved);
            }
          }
        }
      },
    });
  } catch (e) {
    console.warn(`Warning: Could not parse ${filePath}: ${e.message}`);
  }

  return Array.from(requires);
}

// Build dependency tree
function buildDependencyTree(entryFile, projectRoot) {
  const seen = new Set();
  const tree = new Map();

  function crawl(file, parent = null) {
    let absPath;
    try {
      absPath = fs.realpathSync(path.resolve(file)); // resolves symlinks
    } catch (err) {
      console.warn(`Warning: Could not resolve path: ${file}`);
      return null;
    }

    if (seen.has(absPath)) return null;
    seen.add(absPath);

    const relativePath = path.relative(projectRoot, absPath);
    const node = { file: absPath, relative: relativePath, children: [] };
    tree.set(absPath, node);

    if (parent) parent.children.push(node);

    try {
      const code = fs.readFileSync(absPath, 'utf8');
      const deps = extractRequires(code, absPath);
      for (const dep of deps) {
        crawl(dep, node);
      }
    } catch {
      console.warn(`Warning: Could not read file: ${absPath}`);
    }

    return node;
  }

  const rootNode = crawl(entryFile);
  return { root: rootNode, tree };
}

// Print dependency tree
function printTree(node, prefix = '', isLast = true) {
  if (!node) return;
  const connector = isLast ? '└── ' : '├── ';
  const name = path.basename(node.file);
  console.log(`${prefix}${connector}${name}`);

  const newPrefix = prefix + (isLast ? '    ' : '│   ');
  node.children.forEach((child, i) => {
    const last = i === node.children.length - 1;
    printTree(child, newPrefix, last);
  });
}

// Print file tree in Linux tree style
function printFileTree(files, mainFile) {
  const projectRoot = process.cwd();

  // Convert all paths to relative
  const relFiles = files.map(f => path.relative(projectRoot, f));

  // Build nested tree object
  const treeRoot = {};
  for (const file of relFiles) {
    const parts = file.split(path.sep);
    let curr = treeRoot;
    for (const part of parts) {
      if (!curr[part]) curr[part] = {};
      curr = curr[part];
    }
  }

  // Recursive print
  function printNode(node, prefix = '', isLast = true) {
    const entries = Object.keys(node).sort((a, b) => a.localeCompare(b));
    entries.forEach((name, i) => {
      const last = i === entries.length - 1;
      const connector = last ? '└── ' : '├── ';
      console.log(`${prefix}${connector}${name}`);
      if (Object.keys(node[name]).length > 0) {
        const newPrefix = prefix + (last ? '    ' : '│   ');
        printNode(node[name], newPrefix, true);
      }
    });
  }

  // Print app name on top
  const appName = path.basename(mainFile).replace(/\.[^.]+$/, '').toUpperCase();
  console.log(`${appName}/`);

  // Print main file first
  console.log(`└── ${path.basename(mainFile)}`);

  // Print other top-level files
  const topLevelFiles = Object.keys(treeRoot)
    .filter(f => f !== path.basename(mainFile))
    .sort((a, b) => a.localeCompare(b));

  topLevelFiles.forEach((name, i) => {
    const last = i === topLevelFiles.length - 1;
    const connector = last ? '└── ' : '├── ';
    const children = Object.keys(treeRoot[name]);
    if (children.length === 0) {
      console.log(`${connector}${name}`);
    } else {
      console.log(`${connector}${name}`);
      const newPrefix = last ? '    ' : '│   ';
      printNode(treeRoot[name], newPrefix, true);
    }
  });
}

// ---------- MAIN ----------
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: ./app-tree.mjs <main-file.js> [-file-tree]');
    process.exit(1);
  }

  const fileArgIndex = args.findIndex(arg => !arg.startsWith('-'));
  if (fileArgIndex === -1) {
    console.error('Error: No entry file specified');
    process.exit(1);
  }

  const entryFile = path.resolve(args[fileArgIndex]);
  if (!fs.existsSync(entryFile)) {
    console.error(`Error: File not found: ${entryFile}`);
    process.exit(1);
  }

  const { root, tree } = buildDependencyTree(entryFile, process.cwd());

  if (args.includes('-file-tree')) {
    console.log(`\nFile tree for all dependencies of: ${path.basename(entryFile)}\n`);
    const allFiles = Array.from(tree.keys());
    printFileTree(allFiles, entryFile);
  } else {
    console.log(`\nDependency tree for: ${path.basename(entryFile)}\n`);
    printTree(root);
  }

  console.log();
}

main();

// export functions for external scripts
export { buildDependencyTree };

