#!/usr/bin/env node
/*
Network Diagnostics Tool for Sonoff Proxy
Standalone utility to diagnose routing and interception issues

Usage:
  node netcheck.mjs check <device-ip>           - Run full diagnostics
  node netcheck.mjs rules <device-ip>           - Show iptables rules
  node netcheck.mjs monitor <device-ip> [secs]  - Monitor live traffic
  node netcheck.mjs apply <device-ip>           - Apply iptables rules (requires root)
  node netcheck.mjs remove <device-ip>          - Remove iptables rules (requires root)
*/

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';

const execPromise = promisify(exec);

// Configuration - can be overridden by environment variables
const CONFIG = {
    PROXY_IP: process.env.PROXY_IP || '192.168.1.11',
    PROXY_PORT: process.env.PROXY_PORT || 8888,
    PROXY_CONFIG_FILE: process.env.PROXY_CONFIG || './sharedVARs.js'
};

// Try to read proxy configuration from the actual proxy files
function loadProxyConfig() {
    try {
        if (CONFIG.PROXY_CONFIG_FILE.endsWith('.js')) {
            // CommonJS module
            const content = readFileSync(CONFIG.PROXY_CONFIG_FILE, 'utf8');
            const ipMatch = content.match(/PROXY_IP.*?['"]([^'"]+)['"]/);
            const portMatch = content.match(/PROXY_PORT.*?(\d+)/);
            
            if (ipMatch) CONFIG.PROXY_IP = ipMatch[1];
            if (portMatch) CONFIG.PROXY_PORT = parseInt(portMatch[1]);
            
            console.log(`📋 Loaded config from ${CONFIG.PROXY_CONFIG_FILE}`);
            console.log(`   Proxy: ${CONFIG.PROXY_IP}:${CONFIG.PROXY_PORT}\n`);
        }
    } catch (err) {
        console.log(`ℹ️  Using default config: ${CONFIG.PROXY_IP}:${CONFIG.PROXY_PORT}\n`);
    }
}

// Color codes for better readability
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function colorize(text, color) {
    return `${colors[color]}${text}${colors.reset}`;
}

async function checkDeviceRouting(deviceIP) {
    console.log('\n' + colorize('='.repeat(80), 'cyan'));
    console.log(colorize('NETWORK DIAGNOSTICS FOR DEVICE: ' + deviceIP, 'bright'));
    console.log(colorize('='.repeat(80), 'cyan') + '\n');

    let issues = [];
    let recommendations = [];

    try {
        // Check if device is reachable
        console.log(colorize('1. PING TEST', 'bright'));
        console.log('-'.repeat(80));
        try {
            const { stdout: pingResult } = await execPromise(`ping -c 3 -W 2 ${deviceIP}`);
            console.log(colorize('✅ Device is reachable', 'green'));
            // Show just summary line
            const lines = pingResult.split('\n');
            const summary = lines.find(l => l.includes('packets transmitted'));
            if (summary) console.log('   ' + summary.trim());
        } catch (err) {
            console.log(colorize('❌ Device not reachable', 'red'));
            issues.push('Device is offline or unreachable');
            recommendations.push('Check device power and network connection');
        }

        // Check iptables rules
        console.log('\n' + colorize('2. IPTABLES NAT RULES (Traffic Redirection)', 'bright'));
        console.log('-'.repeat(80));
        try {
            const { stdout: iptablesNat } = await execPromise('iptables -t nat -L PREROUTING -n -v --line-numbers 2>&1');
            
            if (iptablesNat.includes('Permission denied') || iptablesNat.includes('you must be root')) {
                console.log(colorize('⚠️  Need root privileges to check iptables', 'yellow'));
                console.log('   Run with: sudo node netcheck.mjs check ' + deviceIP);
                recommendations.push('Run diagnostics with sudo to check iptables rules');
            } else {
                // Check for rules that would apply to this device
                const hasDeviceRule = iptablesNat.match(new RegExp(`\\s${deviceIP.replace(/\./g, '\\.')}\\s`));
                const hasWildcardRule = iptablesNat.match(/0\.0\.0\.0\/0.*dpt:443.*to:.*8888/);
                
                // Extract subnet from device IP (e.g., 192.168.1.0/24)
                const subnet = deviceIP.split('.').slice(0, 3).join('.');
                const hasSubnetRule = iptablesNat.match(new RegExp(`${subnet.replace(/\./g, '\\.')}\\.(\\d+\\/\\d+|0\\/\\d+).*dpt:443`));
                
                if (hasDeviceRule) {
                    console.log(colorize('✅ Found specific NAT rule for this device', 'green'));
                    // Show the specific rule
                    const lines = iptablesNat.split('\n');
                    lines.forEach(line => {
                        if (line.includes(deviceIP)) {
                            console.log(colorize('   ' + line, 'cyan'));
                        }
                    });
                } else if (hasWildcardRule) {
                    console.log(colorize('✅ Found wildcard NAT rule (0.0.0.0/0) covering all devices', 'green'));
                    const lines = iptablesNat.split('\n');
                    lines.forEach(line => {
                        if (line.includes('0.0.0.0/0') && line.includes('dpt:443')) {
                            console.log(colorize('   ' + line, 'cyan'));
                        }
                    });
                    console.log(colorize('   ℹ️  This rule applies to ALL traffic including this device', 'blue'));
                } else if (hasSubnetRule) {
                    console.log(colorize('✅ Found subnet-wide NAT rule covering this device', 'green'));
                    const lines = iptablesNat.split('\n');
                    lines.forEach(line => {
                        if (line.includes(subnet)) {
                            console.log(colorize('   ' + line, 'cyan'));
                        }
                    });
                } else {
                    console.log(colorize('❌ No NAT rule found for this device', 'red'));
                    issues.push('No iptables NAT rule to redirect traffic');
                    recommendations.push('Add iptables rule: see "netrules" command');
                }
                
                // Show relevant rules only
                console.log('\n   Relevant rules:');
                const lines = iptablesNat.split('\n').slice(2); // Skip header
                const relevantLines = lines.filter(l => 
                    l.includes('443') || l.includes('80') || l.includes(deviceIP) || 
                    l.includes(subnet) || l.includes('0.0.0.0/0')
                ).slice(0, 6);
                
                if (relevantLines.length > 0) {
                    relevantLines.forEach((l, idx) => console.log(`   ${idx + 1}${l.substring(l.indexOf(' '))}`));
                } else {
                    console.log(colorize('   (No relevant rules found)', 'yellow'));
                }
            }
        } catch (err) {
            console.log(colorize('❌ Error checking iptables: ' + err.message, 'red'));
        }

        // Check current connections from this device
        console.log('\n' + colorize('3. ACTIVE CONNECTIONS (The Smoking Gun)', 'bright'));
        console.log('-'.repeat(80));
        try {
            const { stdout: connections } = await execPromise(`ss -tn 2>/dev/null | grep ${deviceIP} || netstat -tn 2>/dev/null | grep ${deviceIP} || echo ""`);
            if (connections.trim()) {
                const lines = connections.trim().split('\n');
                console.log(`   Found ${lines.length} active connection(s):\n`);
                
                lines.forEach(line => {
                    console.log('   ' + line);
                    
                    // Analyze destination
                    if (line.includes(CONFIG.PROXY_IP)) {
                        console.log(colorize('   ✅ Connected to PROXY - Good!', 'green'));
                    } else if (line.includes('52.') || line.includes('54.') || 
                               line.includes('13.') || line.includes('18.')) {
                        console.log(colorize('   ❌ Connected to AWS (eWeLink Cloud) - Bypassing proxy!', 'red'));
                        issues.push('Device is connecting directly to eWeLink cloud servers');
                        recommendations.push('Traffic interception is not working - check NAT rules and DNS');
                    }
                });
            } else {
                console.log(colorize('   ℹ️  No active HTTPS connections from this device', 'yellow'));
                console.log('   Device may be idle or not yet connected');
            }
        } catch (err) {
            console.log('   No active connections found');
        }

        // Check DNS resolution
        console.log('\n' + colorize('4. DNS RESOLUTION TEST', 'bright'));
        console.log('-'.repeat(80));
        console.log(colorize('   ℹ️  Checking if DNS resolves eWeLink domains to proxy (optional)', 'blue'));
        console.log('   This is only needed if NOT using iptables NAT rules\n');
        
        const domains = [
            'eu-disp.coolkit.cc',
            'us-disp.coolkit.cc',
            'as-disp.coolkit.cc'
        ];
        
        let dnsWorking = false;
        for (const domain of domains) {
            try {
                const { stdout: dnsResult } = await execPromise(`dig +short ${domain} A 2>/dev/null | head -1 || nslookup ${domain} 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}'`);
                const ip = dnsResult.trim().split('\n')[0];
                
                if (ip) {
                    if (ip === CONFIG.PROXY_IP) {
                        console.log(colorize(`   ✅ ${domain} → ${ip} (Proxy)`, 'green'));
                        dnsWorking = true;
                    } else if (ip.match(/^52\.|^54\.|^13\.|^18\.|^3\.|^34\./)) {
                        console.log(`   ℹ️  ${domain} → ${ip} (Cloud - OK if using NAT)`);
                    } else {
                        console.log(`   ${domain} → ${ip}`);
                    }
                }
            } catch (err) {
                console.log(`   ${domain} - Unable to resolve`);
            }
        }
        
        if (!dnsWorking) {
            console.log(colorize('\n   ℹ️  DNS interception not configured (this is OK)', 'blue'));
            console.log('   NAT rules handle redirection at the network layer instead');
        }

        // Check ARP table
        console.log('\n' + colorize('5. ARP TABLE (Layer 2 Info)', 'bright'));
        console.log('-'.repeat(80));
        try {
            const { stdout: arpTable } = await execPromise(`ip neigh show ${deviceIP} 2>/dev/null || arp -n | grep ${deviceIP}`);
            if (arpTable.trim()) {
                console.log('   ' + arpTable.trim());
                console.log(colorize('   ✅ Device is on local network', 'green'));
            } else {
                console.log('   Device not found in ARP table');
            }
        } catch (err) {
            console.log('   Device not in ARP table');
        }

        // Summary
        console.log('\n' + colorize('='.repeat(80), 'cyan'));
        console.log(colorize('SUMMARY', 'bright'));
        console.log(colorize('='.repeat(80), 'cyan'));
        
        if (issues.length === 0) {
            console.log(colorize('\n✅ No major issues detected!', 'green'));
            console.log('   Device should be able to connect through proxy.');
        } else {
            console.log(colorize('\n❌ Issues Found:', 'red'));
            issues.forEach((issue, i) => {
                console.log(`   ${i + 1}. ${issue}`);
            });
        }
        
        if (recommendations.length > 0) {
            console.log(colorize('\n💡 Recommendations:', 'yellow'));
            recommendations.forEach((rec, i) => {
                console.log(`   ${i + 1}. ${rec}`);
            });
        }
        
        console.log('\n' + colorize('Next Steps:', 'bright'));
        console.log(`   • Show iptables rules:  node netcheck.mjs rules ${deviceIP}`);
        console.log(`   • Monitor live traffic: sudo node netcheck.mjs monitor ${deviceIP}`);
        console.log(`   • Apply iptables rule:  sudo node netcheck.mjs apply ${deviceIP}`);
        console.log('');

    } catch (err) {
        console.error('Error running diagnostics:', err);
    }
}

async function suggestIptablesRules(deviceIP) {
    console.log('\n' + colorize('='.repeat(80), 'cyan'));
    console.log(colorize('IPTABLES RULES FOR DEVICE: ' + deviceIP, 'bright'));
    console.log(colorize('='.repeat(80), 'cyan') + '\n');

    console.log(colorize('HTTPS Redirection (Required):', 'bright'));
    console.log(colorize(`iptables -t nat -A PREROUTING -s ${deviceIP} -p tcp --dport 443 -j DNAT --to-destination ${CONFIG.PROXY_IP}:${CONFIG.PROXY_PORT}`, 'green'));
    
    console.log('\n' + colorize('HTTP Redirection (Optional, if device uses HTTP):', 'bright'));
    console.log(colorize(`iptables -t nat -A PREROUTING -s ${deviceIP} -p tcp --dport 80 -j DNAT --to-destination ${CONFIG.PROXY_IP}:${CONFIG.PROXY_PORT}`, 'yellow'));
    
    console.log('\n' + colorize('To Apply Automatically:', 'bright'));
    console.log(`sudo node netcheck.mjs apply ${deviceIP}`);
    
    console.log('\n' + colorize('To Remove Rules:', 'bright'));
    console.log(`sudo node netcheck.mjs remove ${deviceIP}`);
    
    console.log('\n' + colorize('To List Current Rules:', 'bright'));
    console.log('sudo iptables -t nat -L PREROUTING -n -v --line-numbers');
    
    console.log('\n' + colorize('To Make Rules Persistent (Survive Reboots):', 'bright'));
    console.log('sudo apt-get install iptables-persistent');
    console.log('sudo netfilter-persistent save');
    console.log('');
}

async function applyIptablesRule(deviceIP) {
    console.log('\n' + colorize('Applying iptables rule for ' + deviceIP, 'bright'));
    
    // Check if running as root
    try {
        const { stdout: whoami } = await execPromise('whoami');
        if (whoami.trim() !== 'root') {
            console.log(colorize('❌ Must run as root. Use: sudo node netcheck.mjs apply ' + deviceIP, 'red'));
            process.exit(1);
        }
    } catch (err) {
        console.log(colorize('❌ Cannot determine user privileges', 'red'));
        process.exit(1);
    }
    
    // Check if rule already exists
    try {
        const { stdout: existing } = await execPromise(`iptables -t nat -L PREROUTING -n | grep "${deviceIP}.*dpt:443"`);
        if (existing.trim()) {
            console.log(colorize('⚠️  Rule already exists for this device:', 'yellow'));
            console.log('   ' + existing.trim());
            console.log('\nRemove it first with: sudo node netcheck.mjs remove ' + deviceIP);
            return;
        }
    } catch (err) {
        // Rule doesn't exist, continue
    }
    
    // Apply the rule
    const rule = `iptables -t nat -A PREROUTING -s ${deviceIP} -p tcp --dport 443 -j DNAT --to-destination ${CONFIG.PROXY_IP}:${CONFIG.PROXY_PORT}`;
    
    console.log('Executing: ' + colorize(rule, 'cyan'));
    
    try {
        await execPromise(rule);
        console.log(colorize('✅ Rule applied successfully!', 'green'));
        
        // Verify
        const { stdout: verify } = await execPromise(`iptables -t nat -L PREROUTING -n -v | grep "${deviceIP}"`);
        console.log('\nVerification:');
        console.log(colorize(verify.trim(), 'cyan'));
        
        console.log('\n' + colorize('💡 To make this permanent (survive reboot):', 'yellow'));
        console.log('   sudo apt-get install iptables-persistent');
        console.log('   sudo netfilter-persistent save');
        
    } catch (err) {
        console.log(colorize('❌ Error applying rule: ' + err.message, 'red'));
    }
}

async function removeIptablesRule(deviceIP) {
    console.log('\n' + colorize('Removing iptables rule for ' + deviceIP, 'bright'));
    
    // Check if running as root
    try {
        const { stdout: whoami } = await execPromise('whoami');
        if (whoami.trim() !== 'root') {
            console.log(colorize('❌ Must run as root. Use: sudo node netcheck.mjs remove ' + deviceIP, 'red'));
            process.exit(1);
        }
    } catch (err) {
        console.log(colorize('❌ Cannot determine user privileges', 'red'));
        process.exit(1);
    }
    
    // Find the rule
    try {
        const { stdout: rules } = await execPromise('iptables -t nat -L PREROUTING -n --line-numbers');
        const lines = rules.split('\n');
        
        let lineNumber = null;
        lines.forEach(line => {
            if (line.includes(deviceIP) && line.includes('dpt:443')) {
                const match = line.match(/^(\d+)/);
                if (match) lineNumber = match[1];
            }
        });
        
        if (lineNumber) {
            console.log(`Found rule at line ${lineNumber}`);
            const deleteCmd = `iptables -t nat -D PREROUTING ${lineNumber}`;
            console.log('Executing: ' + colorize(deleteCmd, 'cyan'));
            
            await execPromise(deleteCmd);
            console.log(colorize('✅ Rule removed successfully!', 'green'));
        } else {
            console.log(colorize('⚠️  No rule found for this device', 'yellow'));
        }
    } catch (err) {
        console.log(colorize('❌ Error removing rule: ' + err.message, 'red'));
    }
}

async function monitorDeviceTraffic(deviceIP, duration = 30) {
    console.log('\n' + colorize('='.repeat(80), 'cyan'));
    console.log(colorize(`MONITORING TRAFFIC FROM: ${deviceIP} for ${duration} seconds`, 'bright'));
    console.log(colorize('='.repeat(80), 'cyan') + '\n');
    
    // Check for root
    try {
        const { stdout: whoami } = await execPromise('whoami');
        if (whoami.trim() !== 'root') {
            console.log(colorize('❌ tcpdump requires root privileges', 'red'));
            console.log('   Run with: sudo node netcheck.mjs monitor ' + deviceIP);
            process.exit(1);
        }
    } catch (err) {
        // Continue anyway
    }
    
    console.log('Capturing HTTPS traffic (port 443)...');
    console.log(colorize('Press Ctrl+C to stop early\n', 'yellow'));
    
    const cmd = `timeout ${duration} tcpdump -i any -n -l "host ${deviceIP} and tcp port 443" 2>&1`;
    
    const child = exec(cmd);
    
    let hasTraffic = false;
    let connectsToCloud = false;
    let connectsToProxy = false;
    
    child.stdout.on('data', (data) => {
        hasTraffic = true;
        console.log(data.toString());
        
        if (data.includes('52.') || data.includes('54.') || 
            data.includes('13.') || data.includes('18.')) {
            connectsToCloud = true;
        }
        if (data.includes(CONFIG.PROXY_IP)) {
            connectsToProxy = true;
        }
    });
    
    child.stderr.on('data', (data) => {
        if (!data.includes('listening on')) {
            console.log(data.toString());
        }
    });
    
    child.on('close', (code) => {
        console.log('\n' + colorize('-'.repeat(80), 'cyan'));
        console.log(colorize('ANALYSIS:', 'bright'));
        console.log(colorize('-'.repeat(80), 'cyan'));
        
        if (!hasTraffic) {
            console.log(colorize('⚠️  No HTTPS traffic detected from this device', 'yellow'));
            console.log('   • Device may be idle');
            console.log('   • Try power cycling the device');
            console.log('   • Check if device IP is correct');
        } else if (connectsToProxy) {
            console.log(colorize('✅ Device is connecting to PROXY - Working correctly!', 'green'));
        } else if (connectsToCloud) {
            console.log(colorize('❌ Device is connecting to CLOUD - Bypassing proxy!', 'red'));
            console.log('   • Add iptables NAT rule');
            console.log('   • Or set up DNS interception');
            console.log(`   Run: sudo node netcheck.mjs apply ${deviceIP}`);
        }
        console.log('');
    });
}

// Main CLI handler
function printUsage() {
    console.log(`
${colorize('Sonoff Proxy Network Diagnostics Tool', 'bright')}
${colorize('='.repeat(80), 'cyan')}

${colorize('USAGE:', 'bright')}
  node netcheck.mjs <command> <device-ip> [options]

${colorize('COMMANDS:', 'bright')}
  ${colorize('check', 'green')} <device-ip>              Run comprehensive network diagnostics
  ${colorize('rules', 'green')} <device-ip>              Show suggested iptables rules
  ${colorize('apply', 'green')} <device-ip>              Apply iptables rule (requires root)
  ${colorize('remove', 'green')} <device-ip>             Remove iptables rule (requires root)
  ${colorize('monitor', 'green')} <device-ip> [seconds]  Monitor live traffic (requires root)

${colorize('EXAMPLES:', 'bright')}
  node netcheck.mjs check 192.168.1.100
  sudo node netcheck.mjs apply 192.168.1.100
  sudo node netcheck.mjs monitor 192.168.1.100 60

${colorize('ENVIRONMENT VARIABLES:', 'bright')}
  PROXY_IP=192.168.1.11    Override proxy IP address
  PROXY_PORT=8888          Override proxy port

${colorize('NOTES:', 'bright')}
  • Most commands work without root
  • 'apply', 'remove', and 'monitor' require sudo
  • Run 'check' first to diagnose issues
  • Use 'apply' to automatically fix routing

`);
}

// Parse command line
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const command = args[0];
    const deviceIP = args[1];
    
    if (!command || command === 'help' || command === '--help' || command === '-h') {
        printUsage();
        process.exit(0);
    }
    
    if (!deviceIP) {
        console.log(colorize('❌ Error: Device IP required', 'red'));
        printUsage();
        process.exit(1);
    }
    
    // Load proxy configuration
    loadProxyConfig();
    
    // Execute command
    switch(command) {
        case 'check':
            checkDeviceRouting(deviceIP);
            break;
        case 'rules':
            suggestIptablesRules(deviceIP);
            break;
        case 'apply':
            applyIptablesRule(deviceIP);
            break;
        case 'remove':
            removeIptablesRule(deviceIP);
            break;
        case 'monitor':
            const duration = args[2] ? parseInt(args[2]) : 30;
            monitorDeviceTraffic(deviceIP, duration);
            break;
        default:
            console.log(colorize('❌ Unknown command: ' + command, 'red'));
            printUsage();
            process.exit(1);
    }
}

// Export for optional integration
export { checkDeviceRouting, suggestIptablesRules, monitorDeviceTraffic, applyIptablesRule, removeIptablesRule };
