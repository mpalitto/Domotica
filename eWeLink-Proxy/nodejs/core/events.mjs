import { EventEmitter } from 'events';

// Singleton EventEmitter for the entire proxy
const events = new EventEmitter();

// Optional: set max listeners to avoid warnings for lots of devices/plugins
events.setMaxListeners(100);

export default events;

