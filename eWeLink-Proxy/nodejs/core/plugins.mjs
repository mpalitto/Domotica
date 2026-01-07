import fs from 'fs/promises';
import path from 'path';

/**
 * Load all plugins in the plugins directory
 * @param {EventEmitter} events - shared events
 * @param {object} sONOFF - shared device registry
 * @param {object} CONFIG - configuration
 */
export async function loadPlugins(events, sONOFF, CONFIG) {
  const pluginsDir = path.join(process.cwd(), 'plugins');
  try {
    const files = await fs.readdir(pluginsDir);
    for (const file of files) {
      if (!file.endsWith('.mjs')) continue;

      const pluginPath = `../plugins/${file}`;
      const { default: plugin } = await import(pluginPath);

      if (plugin?.init && typeof plugin.init === 'function') {
        plugin.init(events, sONOFF, CONFIG);
        console.log(`✓ Loaded plugin: ${file}`);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Plugin load error:', err);
    else console.log('No plugins directory found, skipping');
  }
}

