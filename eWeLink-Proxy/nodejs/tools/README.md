======================
Sonoff Proxy Tools
======================

This folder contains utility scripts to inspect, debug, and manage the Sonoff Proxy project.
Includes dependency tree visualization, AI-friendly exports, network diagnostics, connection management, and test requests.

--------------------------------------------------
1. tools/app-tree.mjs
--------------------------------------------------
Description:
Analyzes a JavaScript/Node.js project and prints its dependency tree or file tree.
Resolves local dependencies, supports ES modules and CommonJS, and excludes core Node.js modules.

Usage:
  # Show dependency tree
  ./app-tree.mjs <main-file.js>

  # Show file tree (Linux tree style)
  ./app-tree.mjs <main-file.js> -file-tree

Features:
- Prints the dependency tree of a main JS file.
- Option -file-tree prints files in actual folder structure.
- Main file appears first; other top-level files are sorted alphabetically.
- Can be imported into other scripts via `import { buildDependencyTree } from './app-tree.mjs';`.

--------------------------------------------------
2. tools/export-for-ai.mjs
--------------------------------------------------
Description:
Exports all project files referenced by the dependency tree in a format suitable for sharing with an AI.
Includes all JS/ESM files in alphabetical order with file separators.

Usage:
  ./export-for-ai.mjs <main-file.js>
  ./export-for-ai.mjs <main-file.js> | xclip -selection clipboard

Notes:
- Relies on app-tree.mjs to resolve dependencies.
- Prints each file with its relative path header.

--------------------------------------------------
3. tools/killconn.sh
--------------------------------------------------
Description:
Kills active TCP connections from a specific device IP to the Sonoff Proxy port (default 8888).
Useful to force devices to reconnect through the proxy.

Usage:
  ./killconn.sh <device_ip>

Notes:
- Requires root privileges to kill non-owned connections.
- Automatically identifies the device's source port and terminates it.

--------------------------------------------------
4. tools/monitor-incoming-packets.sh
--------------------------------------------------
Description:
Inserts iptables logging rules to monitor incoming traffic for eWeLink ports (80, 443, 8081).
Logs can be inspected in system logs to debug traffic redirection.

Usage:
  ./monitor-incoming-packets.sh

Cleanup:
  sudo iptables -t nat -D PREROUTING -p tcp --dport 80 -j LOG --log-prefix "EWELINK-PROXY:P80 " --log-level 7
  sudo iptables -t nat -D PREROUTING -p tcp --dport 443 -j LOG --log-prefix "EWELINK-PROXY:P443 " --log-level 7
  sudo iptables -t nat -D PREROUTING -p tcp --dport 8081 -j LOG --log-prefix "EWELINK-PROXY:P8081 " --log-level 7

--------------------------------------------------
5. tools/netcheck.mjs
--------------------------------------------------
Description:
Network diagnostics tool for Sonoff Proxy. Checks routing, NAT rules, active connections, DNS resolution, and ARP tables.
Provides commands to apply/remove iptables rules and monitor live traffic.

Usage:
  node netcheck.mjs check <device-ip>           # Run full diagnostics
  node netcheck.mjs rules <device-ip>           # Show suggested iptables rules
  sudo node netcheck.mjs apply <device-ip>      # Apply iptables rule
  sudo node netcheck.mjs remove <device-ip>     # Remove iptables rule
  sudo node netcheck.mjs monitor <device-ip> [seconds]  # Monitor live traffic

Features:
- Color-coded terminal output.
- Auto-loads proxy IP/port from sharedVARs.js.
- Suggests and verifies iptables rules.
- Monitors live HTTPS traffic to detect bypassing.

--------------------------------------------------
6. tools/test-real-dispatch.mjs
--------------------------------------------------
Description:
Sends a real device request to the official eWeLink server for testing and comparison with the local proxy.
Helps verify that your proxy responses match expected behavior.

Usage:
  node test-real-dispatch.mjs

Notes:
- Sends a POST request with a sample device payload.
- Prints the raw and parsed response from the real server.
- Compares the real server response with your proxy response.

--------------------------------------------------
Folder Structure Overview:
--------------------------------------------------
tools/
├── app-tree.mjs
├── export-for-ai.mjs
├── killconn.sh
├── monitor-incoming-packets.sh
├── netcheck.mjs
└── test-real-dispatch.mjs

--------------------------------------------------
Recommendations:
--------------------------------------------------
- Run app-tree.mjs or export-for-ai.mjs first to inspect dependencies before sharing.
- Use netcheck.mjs to ensure devices are routed through the proxy.
- Run killconn.sh or apply/remove commands with proper privileges.
- Use test-real-dispatch.mjs for verifying your proxy against the real eWeLink servers.

