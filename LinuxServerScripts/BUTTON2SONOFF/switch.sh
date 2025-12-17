#!/bin/bash
#=============================================================================
# MAIN SWITCH HANDLER SCRIPT (Configuration-Driven Version)
# 
# PURPOSE:
#   Processes wall switch events from various sources and triggers
#   corresponding actions (like controlling lights via Arduino).
#
# ARCHITECTURE:
#   1. Raw switch data arrives in $IoTserverScripts/tmp-files/buttonPress.log (from various sources)
#   2. Preprocessor scripts convert raw data to universal format
#   3. This main script processes the universal format and triggers actions
#   4. Button mappings are loaded from wallSwitches.list (no code changes needed)
#
# UNIVERSAL FORMAT (output from preprocessors):
#   SWITCH_ID BUTTON_NUMBER SOURCE_TYPE [EXTRA_INFO...]
#   Examples:
#     - RFXCOM:  "B1E46 1 RFXCOM"
#     - KINETIC: "AB6EDE 1 KINETIC ESP32_RX_01 -44dBm"
#
# TO ADD A NEW SWITCH:
#   Simply add entries to wallSwitches.list - no code changes required!
#
# TO ADD A NEW SWITCH TYPE/PROTOCOL:
#   1. Create a preprocessor script: preprocess_<type>.sh
#   2. The preprocessor must output the universal format to stdout
#   3. Add detection pattern in detect_source_type() function
#
# NOTES:
#   To send codes to RFXCOM (i.e. B1E461) from command line:
#     screen /dev/ttyUSB0 38400
#     press ^A^D to detach from screen session
#     echo -e \\x09\\x13\\x00\\x10\\xb1\\xe4\\x61\\x01\\x57\\xc0\\x02 > /dev/ttyUSB0
#=============================================================================

#-----------------------------------------------------------------------------
# CONFIGURATION SECTION
#-----------------------------------------------------------------------------

# Script directory (assumes IoTserverScripts is set, or use script location)
SCRIPT_DIR="${IoTserverScripts:-$(dirname "$(readlink -f "$0")")}"
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
echo "SCRIPT_DIR: $SCRIPT_DIR"

# Directory containing preprocessor scripts
PREPROCESSOR_DIR="${SCRIPT_DIR}"

# Temporary files
TMP_FILE="${IoTserverScripts}/tmp-files/buttonPress.log"
LAST_SWITCH_FILE="${SCRIPT_DIR}/tmp-files/.lastSwitch"
LAST_SWITCH_TMP="${SCRIPT_DIR}/tmp-files/.lastSwitch.tmp"

# Debounce timeout in seconds (prevents duplicate switch triggers)
DEBOUNCE_TIMEOUT=2

# Configuration files
WALL_SWITCHES_LIST="${SCRIPT_DIR}/wallSwitches.list"
SONOFF_LIST="${SCRIPT_DIR}/sONOFF.list"

# Logging configuration
# Set LOG_LEVEL environment variable to: DEBUG, INFO, WARN, or ERROR
LOG_LEVEL="${LOG_LEVEL:-INFO}"

#-----------------------------------------------------------------------------
# LOGGING FUNCTIONS
#-----------------------------------------------------------------------------

# Log debug messages (only shown when LOG_LEVEL=DEBUG)
log_debug() {
    [[ "$LOG_LEVEL" == "DEBUG" ]] && echo "[DEBUG] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

# Log info messages (shown for DEBUG and INFO levels)
log_info() {
    [[ "$LOG_LEVEL" =~ ^(DEBUG|INFO)$ ]] && echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

# Log warning messages (shown for DEBUG, INFO, and WARN levels)
log_warn() {
    [[ "$LOG_LEVEL" =~ ^(DEBUG|INFO|WARN)$ ]] && echo "[WARN] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

# Log error messages (always shown, sent to stderr)
log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

#-----------------------------------------------------------------------------
# UTILITY FUNCTIONS
#-----------------------------------------------------------------------------

# Check if another instance is already running
# Exits with error if duplicate instance detected
check_single_instance() {
    local process
    process="$(pgrep -f "$(basename "$0")")"
    if [ "$(wc -w <<< "$process")" -gt 1 ]; then
        log_error "switch.sh already running (PIDs: $process)... exiting"
        exit 1
    fi
}

#-----------------------------------------------------------------------------
# CONFIGURATION LOADING FUNCTIONS
#-----------------------------------------------------------------------------

# Load switch mappings from wallSwitches.list configuration file
# 
# This function parses the configuration file and populates two associative arrays:
#   - Switch[ID] = NAME (switch ID to human-readable name)
#   - ButtonMap[ID:BUTTON] = TARGET (switch ID + button number to sONOFF target)
#
# File format:
#   SWITCH_ID # SWITCH_NAME optional description
#       button N: TARGET_NAME
#
load_switch_mappings() {
    log_info "Loading switch mappings from ${WALL_SWITCHES_LIST}"
    
    # Declare global associative arrays
    # Switch: maps switch ID to switch name
    # ButtonMap: maps "switchID:buttonNumber" to sONOFF target name
    declare -gA Switch
    declare -gA ButtonMap
    
    # Variables to track current switch being parsed
    local current_switch_id=""
    local current_switch_name=""
    local line_number=0
    
    # Read the configuration file line by line
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((line_number++))
        
        # Skip empty lines
        [[ -z "${line// /}" ]] && continue
        
        # Skip comment-only lines (lines starting with #, ignoring leading whitespace)
        [[ "${line}" =~ ^[[:space:]]*# ]] && continue
        
        # Check if this is a button mapping line (starts with whitespace)
        if [[ "${line}" =~ ^[[:space:]]+ ]]; then
            # This is a button mapping line
            # Expected format: "    button N: TARGET_NAME" or "    button N: TARGET_NAME # comment"
            
            # Skip if we don't have a current switch context
            if [[ -z "$current_switch_id" ]]; then
                log_warn "Line $line_number: Button mapping found without switch context: $line"
                continue
            fi
            
            # Parse button line using regex
            # Match: optional whitespace, "button", whitespace, number, colon, whitespace, target name
            if [[ "${line}" =~ ^[[:space:]]+button[[:space:]]+([0-9]+)[[:space:]]*:[[:space:]]*([^#[:space:]]+) ]]; then
                local button_num="${BASH_REMATCH[1]}"
                local target_name="${BASH_REMATCH[2]}"
                
                # Create the mapping key: "SWITCH_ID:BUTTON_NUMBER"
                local map_key="${current_switch_id}:${button_num}"
                
                # Store the mapping
                ButtonMap["$map_key"]="$target_name"
                
                log_debug "ButtonMap[$map_key]=$target_name"
            else
                # Line is indented but doesn't match button format - might be a comment
                log_debug "Line $line_number: Skipping indented non-button line: $line"
            fi
        else
            # This is a switch definition line (not indented)
            # Expected format: "SWITCH_ID # SWITCH_NAME optional description"
            
            # Parse switch line: extract ID (first word) and name (first word after #)
            if [[ "${line}" =~ ^([0-9A-Fa-f]+)[[:space:]]+#[[:space:]]+([^[:space:]]+) ]]; then
                current_switch_id="${BASH_REMATCH[1]}"
                current_switch_name="${BASH_REMATCH[2]}"
                
                # Store switch ID to name mapping
                Switch["$current_switch_id"]="$current_switch_name"
                
                log_debug "Switch[$current_switch_id]=$current_switch_name"
            else
                # Line doesn't match expected format
                log_debug "Line $line_number: Skipping unrecognized line: $line"
                current_switch_id=""
                current_switch_name=""
            fi
        fi
        
    done < "$WALL_SWITCHES_LIST"
    
    log_info "Loaded ${#Switch[@]} switches with ${#ButtonMap[@]} button mappings"
}

# Load sONOFF device mappings from configuration file
# Creates associative array: sONOFF[NAME] = CODE
#
# These are the target devices (lights, outlets, etc.) that can be controlled
load_sonoff_mappings() {
    log_info "Loading sONOFF mappings from ${SONOFF_LIST}"
    
    # Declare global associative array
    declare -gA sONOFF
    
    # Parse the configuration file
    # Format expected: V s:CODE # NAME - description
    local IDs Names n
    
    # Extract codes (lines starting with V, get the code after "s:")
    IDs=($(sed -n "/^V/{s/V s://; s/ .*//; p}" "$SONOFF_LIST" 2>/dev/null))
    
    # Extract names (get text after # and before " - ")
    Names=($(sed -n "/^V/{s/.*# //; s/ - .*//; p}" "$SONOFF_LIST" 2>/dev/null))
    
    n=0
    for ID in "${IDs[@]}"; do
        sONOFF[${Names[$n]}]=$ID
        log_debug "sONOFF[${Names[$n]}]=${sONOFF[${Names[$n]}]}"
        ((n++))
    done
    
    log_info "Loaded ${#sONOFF[@]} sONOFF device mappings"
}

#-----------------------------------------------------------------------------
# DEBOUNCE FUNCTIONS
# 
# Debouncing prevents the same switch event from being processed multiple
# times in quick succession (RF signals often repeat)
#-----------------------------------------------------------------------------

# Initialize the last switch tracking file
init_debounce_file() {
    echo -n > "$LAST_SWITCH_FILE"
}

# Check if a switch event should be processed (debounce logic)
# Arguments:
#   $1 - switch_code: unique identifier for this switch+button combination
# Returns:
#   0 - if event should be processed (first occurrence)
#   1 - if event should be ignored (duplicate within timeout)
check_debounce() {
    local switch_code="$1"
    
    # Check if this code was recently processed
    if grep -q "$switch_code" "$LAST_SWITCH_FILE" 2>/dev/null; then
        log_debug "Debounce: ignoring duplicate $switch_code"
        return 1
    fi
    
    # Add code to debounce file
    echo "$switch_code" >> "$LAST_SWITCH_FILE"
    
    # Schedule removal of this code after timeout (runs in background)
    (
        sleep "$DEBOUNCE_TIMEOUT"
        grep -v "$switch_code" "$LAST_SWITCH_FILE" > "$LAST_SWITCH_TMP" 2>/dev/null
        mv "$LAST_SWITCH_TMP" "$LAST_SWITCH_FILE" 2>/dev/null
    ) &
    
    return 0
}

#-----------------------------------------------------------------------------
# ARDUINO COMMUNICATION
#-----------------------------------------------------------------------------

# Send command to Arduino via screen session
# Arguments:
#   $1 - selection: the sONOFF code to send
send_arduino_command() {
    local selection="$1"
    
    if [[ -n "$selection" ]]; then
        log_info "Sending command to Arduino: s:$selection"
        screen -S arduino433tx -X stuff "s:$selection"
    else
        log_debug "No selection to send"
    fi
}

#-----------------------------------------------------------------------------
# PREPROCESSOR MANAGEMENT
#
# Preprocessors convert raw switch data from various protocols/formats
# into a universal format that this script can process.
#-----------------------------------------------------------------------------

# Detect the source type from a raw line
# Arguments:
#   $1 - line: raw input line from tmp-files/buttonPress.log file
# Returns (via stdout):
#   Source type identifier (RFXCOM, KINETIC, etc.) or UNKNOWN
detect_source_type() {
    local line="$1"
    
    # RFXCOM format: starts with 0A1400 (hex data from RFXCOM transceiver)
    if [[ "${line:0:6}" == "0A1400" ]]; then
        echo "RFXCOM"
        return 0
    fi
    
    # KINETIC format: starts with "KINETIC" keyword
    if [[ "${line:0:7}" == "KINETIC" ]]; then
        echo "KINETIC"
        return 0
    fi
    
    # Add new source types here:
    # if [[ "${line:0:X}" == "PATTERN" ]]; then
    #     echo "NEW_TYPE"
    #     return 0
    # fi
    
    # Unknown format
    echo "UNKNOWN"
    return 1
}

# Call the appropriate preprocessor for a given source type
# Arguments:
#   $1 - source_type: type identifier (RFXCOM, KINETIC, etc.)
#   $2 - raw_line: the raw input line to process
# Returns (via stdout):
#   Universal format line: "SWITCH_ID BUTTON_NUMBER SOURCE_TYPE [EXTRA...]"
preprocess_line() {
    local source_type="$1"
    local raw_line="$2"
    
    # Build preprocessor script path (lowercase source type)
    local preprocessor="${PREPROCESSOR_DIR}/preprocess_${source_type,,}.sh"
    
    # Check if preprocessor exists and is executable
    if [[ ! -x "$preprocessor" ]]; then
        log_error "Preprocessor not found or not executable: $preprocessor"
        return 1
    fi
    
    # Call preprocessor with raw line, capture output
    "$preprocessor" "$raw_line"
}

#-----------------------------------------------------------------------------
# MAIN EVENT PROCESSING
#-----------------------------------------------------------------------------

# Look up the sONOFF target for a given switch ID and button number
# Arguments:
#   $1 - switch_id: the hardware ID of the switch
#   $2 - button: the button number pressed
# Returns (via stdout):
#   The sONOFF code to send, or empty string if no mapping exists
get_button_action() {
    local switch_id="$1"
    local button="$2"
    
    # Create the lookup key
    local map_key="${switch_id}:${button}"
    
    # Look up the target name in ButtonMap
    local target_name="${ButtonMap[$map_key]}"
    
    if [[ -z "$target_name" ]]; then
        log_debug "No mapping found for $map_key"
        echo ""
        return 1
    fi
    
    # Look up the sONOFF code for this target
    local sonoff_code="${sONOFF[$target_name]}"
    
    if [[ -z "$sonoff_code" ]]; then
        log_warn "Target '$target_name' not found in sONOFF mappings"
        echo ""
        return 1
    fi
    
    log_debug "Mapping: $map_key -> $target_name -> $sonoff_code"
    echo "$sonoff_code"
    return 0
}

# Process a switch event in universal format
# Arguments:
#   $1 - switch_id: the hardware ID of the switch
#   $2 - button: the button number pressed
#   $3 - source_type: the protocol/source type (for logging)
process_switch_event() {
    local switch_id="$1"
    local button="$2"
    local source_type="$3"
    
    # Get switch name from ID (for logging purposes)
    local switch_name="${Switch[$switch_id]}"
    
    if [[ -z "$switch_name" ]]; then
        log_warn "Unknown switch ID: $switch_id"
        return 1
    fi
    
    log_info "Processing: Switch=$switch_name (ID=$switch_id) Button=$button Source=$source_type"
    
    # Look up the action for this button
    local selection
    selection=$(get_button_action "$switch_id" "$button")
    
    # Send command if we have a selection
    if [[ -n "$selection" ]]; then
        send_arduino_command "$selection"
    else
        log_debug "No action defined for $switch_name button $button"
    fi
}

# Parse universal format line and extract components
# Arguments:
#   $1 - line: universal format line from preprocessor
# Sets global variables:
#   PARSED_SWITCH_ID, PARSED_BUTTON, PARSED_SOURCE, PARSED_EXTRA
parse_universal_line() {
    local line="$1"
    
    # Split line into array
    read -ra parts <<< "$line"
    
    # Extract components
    PARSED_SWITCH_ID="${parts[0]}"
    PARSED_BUTTON="${parts[1]}"
    PARSED_SOURCE="${parts[2]}"
    PARSED_EXTRA="${parts[*]:3}"
    
    log_debug "Parsed: ID=$PARSED_SWITCH_ID BTN=$PARSED_BUTTON SRC=$PARSED_SOURCE EXTRA=$PARSED_EXTRA"
}

#-----------------------------------------------------------------------------
# MAIN LOOP
#-----------------------------------------------------------------------------

main() {
    log_info "=============================================="
    log_info "Starting switch handler (configuration-driven)"
    log_info "=============================================="
    
    # Ensure only one instance is running
    check_single_instance
    
    # Create preprocessor directory if it doesn't exist
    mkdir -p "$PREPROCESSOR_DIR"
    
    # Load configuration files
    load_switch_mappings    # Load switch IDs, names, and button mappings
    load_sonoff_mappings    # Load sONOFF device codes
    
    # Initialize debounce tracking
    init_debounce_file
    
    log_info "Monitoring $TMP_FILE for switch events..."
    log_info "Press Ctrl+C to stop"
    
    # Main processing loop
    # tail -n0 -f: follow the file, starting from the end (only new lines)
    tail -n0 -f "$TMP_FILE" | while read -r line; do
        log_debug "Raw input: $line"
        
        # Detect source type (RFXCOM, KINETIC, etc.)
        local source_type
        source_type=$(detect_source_type "$line")
        
        if [[ "$source_type" == "UNKNOWN" ]]; then
            log_debug "Unknown format, filtering out: $line"
            continue
        fi
        
        log_debug "Detected source type: $source_type"
        
        # Preprocess line to universal format
        local universal_line
        universal_line=$(preprocess_line "$source_type" "$line")
        
        if [[ -z "$universal_line" || "$universal_line" == "INVALID" ]]; then
            log_debug "Preprocessor returned invalid result for: $line"
            continue
        fi
        
        log_debug "Universal format: $universal_line"
        
        # Parse universal format into components
        parse_universal_line "$universal_line"
        
        # Create unique debounce key (switch ID + button number)
        local debounce_key="${PARSED_SWITCH_ID}${PARSED_BUTTON}"
        
        # Check debounce (skip if duplicate within timeout)
        if ! check_debounce "$debounce_key"; then
            continue
        fi
        
        # Process the switch event
        process_switch_event "$PARSED_SWITCH_ID" "$PARSED_BUTTON" "$PARSED_SOURCE"
        
    done
}

# Run main function with all command line arguments
main "$@"
