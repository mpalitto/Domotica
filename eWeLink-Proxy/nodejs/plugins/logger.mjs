// ---------------- Example Plugin: plugins/logger.mjs ----------------
// Create a 'plugins' folder and add this file for testing
export default {
init: (events, sONOFF, CONFIG) => {
events.on('device:connected', ({ deviceID }) => {
console.log(`[Plugin] Device connected: ${deviceID}`);
});
events.on('device:updated', ({ deviceID, params }) => {
console.log(`[Plugin] Device updated: ${deviceID} with ${JSON.stringify(params)}`);
});
// Add more listeners as needed
}
};
