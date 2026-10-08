#!/usr/bin/env node
/*
 * Build the web UI app bundle.
 *
 * The app source lives in webui-app.jsx (JSX + ES2015+). This script compiles
 * it to plain ES5 in app.js so that very old browsers (e.g. the iPad mini wall
 * panel stuck on iOS 9/12 Safari) can render the UI without a runtime
 * transpiler (Babel standalone) or any CDN dependency.
 *
 * Requirements (devDependencies of this package):
 *   @babel/core @babel/preset-env @babel/preset-react regenerator-runtime
 *
 * Usage:
 *   npm install          # once, to get the devDependencies
 *   node build-webui.js  # after editing webui-app.jsx
 *
 * Output: app.js  (referenced by index.html as <script src="/app.js">)
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const SRC_FILE = path.join(__dirname, 'webui-app.jsx');
const OUT_FILE = path.join(__dirname, 'app.js');

const code = fs.readFileSync(SRC_FILE, 'utf8');

const { code: compiled } = babel.transformSync(code, {
    filename: 'webui-app.jsx',
    presets: [
        // Conservative target: full ES5 output. Old Safari (iOS 9.3) cannot
        // parse arrow functions, template literals, async/await, classes or
        // generators, so we down-compile everything, generators included.
        ['@babel/preset-env', { targets: { ie: '8' } }],
        ['@babel/preset-react', { runtime: 'classic' }],
    ],
    comments: false,
    sourceMaps: false,
    babelrc: false,
    configFile: false,
});

// The compiled output drives async/await (and generators) through
// regeneratorRuntime, which old browsers don't provide. Prepend the runtime
// so app.js is self-contained.
const regenerator = fs.readFileSync(
    require.resolve('regenerator-runtime/runtime'),
    'utf8'
);

const banner =
    '/*! GENERATED FILE - do not edit by hand.\n' +
    ' * Source: webui-app.jsx (compiled to ES5 for old-OS wall panels).\n' +
    ' * Rebuild with: node build-webui.js\n' +
    ' */\n';

fs.writeFileSync(OUT_FILE, banner + regenerator + '\n' + compiled + '\n');
console.log('Wrote ' + OUT_FILE + ' (' + fs.statSync(OUT_FILE).size + ' bytes)');