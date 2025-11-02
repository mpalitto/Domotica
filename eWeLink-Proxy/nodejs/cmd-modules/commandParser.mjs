/*
Author: Matteo Palitto
Date: January 9, 2024

Description: commandParser.mjs
Parses command strings and extracts command name and arguments
*/

export class CommandParser {
    static #WHITESPACE_RE = /\s*(?: |\n)\s*/;

    /**
     * Parse command string into command and arguments
     * @param {string} str - Command string
     * @returns {object} - { cmd, args, deviceID }
     */
    static parse(str, deviceIDMap) {
        const args = str.split(this.#WHITESPACE_RE);
        const cmd = args.shift();
        
        // Resolve device ID (could be alias)
        let deviceID = args[0];
        if (deviceID && deviceIDMap[deviceID]) {
            deviceID = deviceIDMap[deviceID];
        }

        return {
            cmd: cmd,
            args: args,
            deviceID: deviceID
        };
    }

    /**
     * Get help text for all commands
     */
    static getHelpText() {
        return [
            'Available commands and their syntax:',
            'switch <deviceID|alias> <on|off> : Switches the device on or off.',
            'name <deviceID> <devAlias>       : Assigns an alias to a device.',
            'list [online|offline|on|off|all] : Lists devices based on status filters.',
            'kick <deviceID|alias>            : Forces device to disconnect and reconnect.',
            'debug <deviceID|alias>           : Show what the proxy knows about the device.',
            'stats <deviceID|alias|all>       : Shows connection statistics for device(s).',
            'diag <deviceID|alias|all>        : Shows detailed diagnostic information for device(s).',
            'verify-stats <deviceID|alias|all>: Shows raw stats object for debugging.',
            '?                                : Lists all available commands and their syntax.'
        ].join('\r\n') + '\r\n';
    }
}
