/*
Author: Matteo Palitto
Date: January 9, 2024

Description: commandRouter.mjs
Routes parsed commands to appropriate handlers
*/

import { CommandParser } from './commandParser.mjs';
import { DeviceCommands } from './deviceCommands.mjs';
import { DeviceManagement } from './deviceManagement.mjs';
import { StatsCommands } from './statsCommands.mjs';

export class CommandRouter {
    /**
     * Execute a command
     */
    static execute(commandString, deviceIDMap, client = null) {
        const parsed = CommandParser.parse(commandString, deviceIDMap);
        const { cmd, args, deviceID } = parsed;
        
        console.log('CMD: ' + cmd);
        console.log('ARGs: ' + args);

        try {
            switch (cmd) {
                case '?':
                    if (client) {
                        client.write(CommandParser.getHelpText());
                    }
                    break;

                case 'switch':
                    if (args.length < 2) {
                        throw new Error('Usage: switch <deviceID|alias> <on|off>');
                    }
                    DeviceCommands.switchDevice(deviceID, args[1], client);
                    break;

                case 'name':
                    if (args.length < 2) {
                        throw new Error('Usage: name <deviceID> <alias>');
                    }
                    DeviceManagement.nameDevice(args[0], args[1], deviceIDMap);
                    break;

                case 'list':
                    if (!client) {
                        console.log('List command only available via socket');
                        break;
                    }
                    DeviceManagement.listDevices(args[0] || 'online', client);
                    break;

                case 'kick':
                    if (args.length < 1) {
                        throw new Error('Usage: kick <deviceID|alias>');
                    }
                    DeviceCommands.kickDevice(deviceID, client);
                    break;

                case 'debug':
                    if (args.length < 1) {
                        throw new Error('Usage: debug <deviceID|alias>');
                    }
                    DeviceCommands.debugDevice(deviceID, client);
                    break;

                case 'stats':
                    if (!client) {
                        console.log('Stats command only available via socket');
                        break;
                    }
                    StatsCommands.showStats(args[0] || 'all', deviceIDMap, client);
                    break;

                case 'diag':
                    if (!client) {
                        console.log('Diag command only available via socket');
                        break;
                    }
                    StatsCommands.showDiagnostics(args[0] || 'all', deviceIDMap, client);
                    break;

                case 'verify-stats':
                    if (!client) {
                        console.log('Verify-stats command only available via socket');
                        break;
                    }
                    StatsCommands.verifyStats(args[0] || 'all', deviceIDMap, client);
                    break;

                default:
                    console.log('WARNING: command not found: ' + cmd);
                    if (client) {
                        client.write('Unknown command: ' + cmd + '\r\n');
                        client.write('Type ? for help\r\n');
                    }
            }
        } catch (error) {
            console.error('Command error:', error.message);
            if (client) {
                client.write('ERROR: ' + error.message + '\r\n');
            }
        }
    }
}
