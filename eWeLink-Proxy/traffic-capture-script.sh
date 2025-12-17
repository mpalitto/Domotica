#!/bin/bash

#=============================================================================
# SONOFF Device Traffic Monitor
# Monitors DNS requests for eu-disp.coolkit.cc and captures all traffic
# from devices making those requests
#=============================================================================

# Configuration
DNS_DOMAIN="eu-disp.coolkit.cc"
CAPTURE_DIR="sONOFFcapture"
STATE_FILE="${CAPTURE_DIR}/device_state.db"
DEVICE_LIST="${CAPTURE_DIR}/device_list.txt"
LOG_FILE="${CAPTURE_DIR}/monitor.log"
OFFLINE_MULTIPLIER=3  # Mark offline if no request after N times average
INTERFACE="eth0"      # Change to your network interface

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Create capture directory
mkdir -p "$CAPTURE_DIR"
touch "$STATE_FILE"

# Associative arrays to store device info
declare -A DEVICE_IP_TO_MAC
declare -A DEVICE_LAST_SEEN
declare -A DEVICE_REQUEST_TIMES
declare -A DEVICE_AVERAGE
declare -A DEVICE_STATUS
declare -A DEVICE_CAPTURE_PID

#=============================================================================
# Function: Get MAC address from IP
#=============================================================================
get_mac_from_ip() {
    local ip=$1
    local mac=$(arp -n "$ip" 2>/dev/null | grep "$ip" | awk '{print $3}' | head -1)
    
    if [[ -z "$mac" || "$mac" == "<incomplete>" ]]; then
        # Try to ping to populate ARP cache
        ping -c 1 -W 1 "$ip" >/dev/null 2>&1
        sleep 0.5
        mac=$(arp -n "$ip" 2>/dev/null | grep "$ip" | awk '{print $3}' | head -1)
    fi
    
    # Return MAC or "unknown" if not found
    [[ -n "$mac" && "$mac" != "<incomplete>" ]] && echo "$mac" || echo "unknown_${ip}"
}

#=============================================================================
# Function: Calculate average time between requests
#=============================================================================
calculate_average() {
    local mac=$1
    local times_str="${DEVICE_REQUEST_TIMES[$mac]}"
    
    if [[ -z "$times_str" ]]; then
        echo "0"
        return
    fi
    
    IFS=',' read -ra times <<< "$times_str"
    local count=${#times[@]}
    
    if [[ $count -lt 2 ]]; then
        echo "0"
        return
    fi
    
    local total_diff=0
    for ((i=1; i<count; i++)); do
        local diff=$((times[i] - times[i-1]))
        total_diff=$((total_diff + diff))
    done
    
    local avg=$((total_diff / (count - 1)))
    echo "$avg"
}

#=============================================================================
# Function: Add request time for a device
#=============================================================================
add_request_time() {
    local mac=$1
    local timestamp=$2
    
    if [[ -z "${DEVICE_REQUEST_TIMES[$mac]}" ]]; then
        DEVICE_REQUEST_TIMES[$mac]="$timestamp"
    else
        # Keep last 10 timestamps for average calculation
        IFS=',' read -ra times <<< "${DEVICE_REQUEST_TIMES[$mac]}"
        times+=("$timestamp")
        if [[ ${#times[@]} -gt 10 ]]; then
            times=("${times[@]: -10}")
        fi
        DEVICE_REQUEST_TIMES[$mac]=$(IFS=','; echo "${times[*]}")
    fi
}

#=============================================================================
# Function: Start packet capture for a device
#=============================================================================
start_capture() {
    local ip=$1
    local mac=$2
    local sanitized_mac=$(echo "$mac" | tr ':' '-')
    local capture_file="${CAPTURE_DIR}/${sanitized_mac}.pcap"
    
    # Stop existing capture if running
    if [[ -n "${DEVICE_CAPTURE_PID[$mac]}" ]]; then
        local old_pid="${DEVICE_CAPTURE_PID[$mac]}"
        if kill -0 "$old_pid" 2>/dev/null; then
            kill "$old_pid" 2>/dev/null
            sleep 1
        fi
    fi
    
    # Start new capture in background (append mode)
    tcpdump -i "$INTERFACE" -n "host $ip" -w "$capture_file" -C 100 >/dev/null 2>&1 &
    DEVICE_CAPTURE_PID[$mac]=$!
    
    log_message "Started capture for $mac ($ip) -> $capture_file [PID: ${DEVICE_CAPTURE_PID[$mac]}]"
}

#=============================================================================
# Function: Check device status and mark offline if needed
#=============================================================================
check_device_status() {
    local current_time=$(date +%s)
    
    for mac in "${!DEVICE_LAST_SEEN[@]}"; do
        local last_seen="${DEVICE_LAST_SEEN[$mac]}"
        local time_diff=$((current_time - last_seen))
        local avg="${DEVICE_AVERAGE[$mac]:-0}"
        
        # Only check if we have a valid average
        if [[ "$avg" -gt 0 ]] && [[ "${DEVICE_STATUS[$mac]}" == "ONLINE" ]]; then
            local threshold=$((avg * OFFLINE_MULTIPLIER))
            
            if [[ "$time_diff" -gt "$threshold" ]]; then
                DEVICE_STATUS[$mac]="OFFLINE"
                log_message "Device $mac marked OFFLINE (last seen: ${time_diff}s ago, threshold: ${threshold}s)" "RED"
                
                # Stop capture for offline device
                if [[ -n "${DEVICE_CAPTURE_PID[$mac]}" ]]; then
                    kill "${DEVICE_CAPTURE_PID[$mac]}" 2>/dev/null
                    unset DEVICE_CAPTURE_PID[$mac]
                fi
            fi
        fi
    done
}

#=============================================================================
# Function: Update device list file
#=============================================================================
update_device_list() {
    {
        echo "=================================================================================================="
        echo "SONOFF Device Monitoring - Last Updated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "=================================================================================================="
        printf "%-20s | %-15s | %-19s | %-12s | %-10s\n" "MAC Address" "IP Address" "Last Seen" "Avg (sec)" "Status"
        echo "--------------------------------------------------------------------------------------------------"
        
        for mac in "${!DEVICE_LAST_SEEN[@]}"; do
            local ip="${DEVICE_IP_TO_MAC[$mac]}"
            local last_seen_ts="${DEVICE_LAST_SEEN[$mac]}"
            local last_seen_str=$(date -d "@$last_seen_ts" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "N/A")
            local avg="${DEVICE_AVERAGE[$mac]:-0}"
            local status="${DEVICE_STATUS[$mac]:-ONLINE}"
            
            [[ "$avg" -gt 0 ]] && local avg_str="${avg}s" || local avg_str="calculating..."
            
            printf "%-20s | %-15s | %-19s | %-12s | %-10s\n" "$mac" "$ip" "$last_seen_str" "$avg_str" "$status"
        done
        
        echo "=================================================================================================="
        echo "Total devices: ${#DEVICE_LAST_SEEN[@]}"
        echo "Offline multiplier: ${OFFLINE_MULTIPLIER}x"
    } > "$DEVICE_LIST"
}

#=============================================================================
# Function: Save state to disk
#=============================================================================
save_state() {
    {
        for mac in "${!DEVICE_LAST_SEEN[@]}"; do
            local ip="${DEVICE_IP_TO_MAC[$mac]}"
            local last_seen="${DEVICE_LAST_SEEN[$mac]}"
            local times="${DEVICE_REQUEST_TIMES[$mac]}"
            local avg="${DEVICE_AVERAGE[$mac]:-0}"
            local status="${DEVICE_STATUS[$mac]:-ONLINE}"
            echo "$mac|$ip|$last_seen|$times|$avg|$status"
        done
    } > "$STATE_FILE"
}

#=============================================================================
# Function: Load state from disk
#=============================================================================
load_state() {
    if [[ -f "$STATE_FILE" && -s "$STATE_FILE" ]]; then
        while IFS='|' read -r mac ip last_seen times avg status; do
            [[ -z "$mac" ]] && continue
            DEVICE_IP_TO_MAC[$mac]="$ip"
            DEVICE_LAST_SEEN[$mac]="$last_seen"
            DEVICE_REQUEST_TIMES[$mac]="$times"
            DEVICE_AVERAGE[$mac]="$avg"
            DEVICE_STATUS[$mac]="$status"
        done < "$STATE_FILE"
    fi
}

#=============================================================================
# Function: Log message
#=============================================================================
log_message() {
    local message=$1
    local color=${2:-GREEN}
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $color in
        RED) echo -e "${RED}[$timestamp] $message${NC}" ;;
        YELLOW) echo -e "${YELLOW}[$timestamp] $message${NC}" ;;
        BLUE) echo -e "${BLUE}[$timestamp] $message${NC}" ;;
        *) echo -e "${GREEN}[$timestamp] $message${NC}" ;;
    esac
    
    echo "[$timestamp] $message" >> "$LOG_FILE"
}

#=============================================================================
# Function: Handle DNS request
#=============================================================================
handle_dns_request() {
    local ip=$1
    local timestamp=$(date +%s)
    
    # Get MAC address
    local mac=$(get_mac_from_ip "$ip")
    
    if [[ -z "$mac" ]]; then
        log_message "Warning: Could not get MAC for $ip" "YELLOW"
        return
    fi
    
    # Check if this is a new device or coming back online
    if [[ -z "${DEVICE_LAST_SEEN[$mac]}" ]]; then
        log_message "NEW device detected: $mac ($ip)" "BLUE"
        start_capture "$ip" "$mac"
    elif [[ "${DEVICE_STATUS[$mac]}" == "OFFLINE" ]]; then
        log_message "Device $mac ($ip) back ONLINE" "BLUE"
        start_capture "$ip" "$mac"
        # Reset request times when coming back online
        DEVICE_REQUEST_TIMES[$mac]="$timestamp"
    fi
    
    # Update device information
    DEVICE_IP_TO_MAC[$mac]="$ip"
    DEVICE_LAST_SEEN[$mac]="$timestamp"
    
    # Only update average if device is online or coming back
    if [[ "${DEVICE_STATUS[$mac]}" != "OFFLINE" ]]; then
        DEVICE_STATUS[$mac]="ONLINE"
        add_request_time "$mac" "$timestamp"
        DEVICE_AVERAGE[$mac]=$(calculate_average "$mac")
        
        log_message "DNS request: $mac ($ip) - Avg interval: ${DEVICE_AVERAGE[$mac]:-calculating...}s"
    fi
}

#=============================================================================
# Function: Display current status
#=============================================================================
display_status() {
    clear
    if [[ -f "$DEVICE_LIST" ]]; then
        cat "$DEVICE_LIST"
        echo ""
        echo "Press Ctrl+C to stop monitoring"
    else
        echo "Waiting for devices to make DNS requests to $DNS_DOMAIN ..."
    fi
}

#=============================================================================
# Function: Cleanup on exit
#=============================================================================
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    
    # Stop all captures
    for mac in "${!DEVICE_CAPTURE_PID[@]}"; do
        local pid="${DEVICE_CAPTURE_PID[$mac]}"
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            log_message "Stopped capture for $mac [PID: $pid]"
        fi
    done
    
    # Save state
    save_state
    log_message "State saved to $STATE_FILE"
    
    # Kill background processes
    [[ -n "$DNS_MONITOR_PID" ]] && kill $DNS_MONITOR_PID 2>/dev/null
    [[ -n "$STATUS_CHECK_PID" ]] && kill $STATUS_CHECK_PID 2>/dev/null
    
    echo "Cleanup complete. Exiting."
    exit 0
}

#=============================================================================
# Main function
#=============================================================================
main() {
    echo "=================================================================================================="
    echo "                              SONOFF Device Traffic Monitor                                      "
    echo "=================================================================================================="
    echo "Monitoring DNS requests for: $DNS_DOMAIN"
    echo "Capture directory: $CAPTURE_DIR"
    echo "Network interface: $INTERFACE"
    echo "Offline threshold: ${OFFLINE_MULTIPLIER}x average interval"
    echo "=================================================================================================="
    echo ""
    
    # Load previous state
    load_state
    log_message "Monitor started - Loaded state for ${#DEVICE_LAST_SEEN[@]} devices" "BLUE"
    
    # Restart captures for online devices
    for mac in "${!DEVICE_LAST_SEEN[@]}"; do
        if [[ "${DEVICE_STATUS[$mac]}" == "ONLINE" ]]; then
            local ip="${DEVICE_IP_TO_MAC[$mac]}"
            start_capture "$ip" "$mac"
        fi
    done
    
    # Start DNS monitoring in background
    tcpdump -i "$INTERFACE" -n -l "port 53" 2>/dev/null | \
    while IFS= read -r line; do
        # Parse DNS query for our domain
        if echo "$line" | grep -q "A? $DNS_DOMAIN"; then
            # Extract source IP
            src_ip=$(echo "$line" | grep -oP '\d+\.\d+\.\d+\.\d+' | head -1)
            
            if [[ -n "$src_ip" ]]; then
                handle_dns_request "$src_ip"
                update_device_list
                save_state
            fi
        fi
    done &
    DNS_MONITOR_PID=$!
    
    # Start periodic status check (every 30 seconds)
    (
        while true; do
            sleep 30
            check_device_status
            update_device_list
            save_state
            display_status
        done
    ) &
    STATUS_CHECK_PID=$!
    
    # Initial display
    update_device_list
    display_status
    
    # Wait for processes
    wait $DNS_MONITOR_PID
}

#=============================================================================
# Entry point
#=============================================================================

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root (sudo)${NC}" 
   exit 1
fi

# Check if tcpdump is installed
if ! command -v tcpdump &> /dev/null; then
    echo -e "${RED}tcpdump is not installed. Please install it first:${NC}"
    echo "  sudo apt-get install tcpdump"
    exit 1
fi

# Run main function
main
