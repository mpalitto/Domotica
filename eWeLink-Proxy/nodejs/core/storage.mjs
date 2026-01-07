// ---------------- storage.mjs ----------------
import fs from 'fs/promises';
import { CONFIG } from './config.mjs';
export const sONOFF = {};

export async function loadAliases() {
try {
const data = await fs.readFile(CONFIG.aliasesFile, 'utf8');
const aliases = JSON.parse(data);
Object.entries(aliases).forEach(([id, alias]) => {
if (!sONOFF[id]) sONOFF[id] = {};
sONOFF[id].alias = alias;
});
console.log('Loaded aliases from file');
} catch (err) {
if (err.code === 'ENOENT') console.log('No aliases file found – using defaults');
else console.error('Aliases load error:', err);
}
}

export async function saveAliases() {
const aliases = {};
Object.entries(sONOFF).forEach(([id, dev]) => {
if (dev.alias) aliases[id] = dev.alias;
});
try {
await fs.writeFile(CONFIG.aliasesFile, JSON.stringify(aliases, null, 2));
console.log('Saved aliases to file');
} catch (err) {
console.error('Aliases save error:', err);
}
}
