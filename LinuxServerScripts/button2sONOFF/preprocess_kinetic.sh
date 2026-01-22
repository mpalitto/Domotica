#!/bin/bash
#=============================================================================
# KINETIC PREPROCESSOR Wall Switch with only 1 button
#
# PURPOSE:
#   Converts KINETIC wall switch format to universal format for the main 
#   switch handler.
#
# INPUT FORMAT (KINETIC):
#   KINETIC AB6EDE BUTTON_1 ESP32_RX_01 -44dBm
#   ^^^^^^^                                    - Protocol identifier
#           ^^^^^^                             - Switch ID (6 hex chars)
#                  ^^^^^^^^                    - Switch Name 
#                           ^^^^^^^^^^         - Receiver ID
#                                      ^^^^^^  - Signal strength
#
# OUTPUT FORMAT (Universal):
#   SWITCH_ID BUTTON_NUMBER SOURCE_TYPE [RECEIVER] [SIGNAL_STRENGTH]
#   Example: AB6EDE 1 KINETIC ESP32_RX_01 -44dBm
#
# EXIT CODES:
#   0 - Success
#   1 - Invalid input format
#
# USAGE:
#   ./preprocess_kinetic.sh "KINETIC AB6EDE BUTTON_1 ESP32_RX_01 -44dBm"
#=============================================================================

# Enable strict mode
set -euo pipefail

# Input: raw line from KINETIC switch
# RAW_LINE="${1:-}"
RAW_LINE="$*"

#-----------------------------------------------------------------------------
# VALIDATION
#-----------------------------------------------------------------------------

# Check if input is provided
if [[ -z "$RAW_LINE" ]]; then
    echo "INVALID: missing input"
    exit 1
fi

# Check if line starts with KINETIC
if [[ "${RAW_LINE:0:7}" != "KINETIC" ]]; then
    echo "INVALID: not kinetck button"
    exit 1
fi

#-----------------------------------------------------------------------------
# PARSING
#-----------------------------------------------------------------------------

# Split the line into an array
read -ra PARTS <<< "$RAW_LINE"

# Validate we have at least 4 parts: KINETIC ID BUTTON RECEIVER
if [[ ${#PARTS[@]} -lt 4 ]]; then
    echo "INVALID: $RAW_LINE parts: ${#PARTS[@]}"
    exit 1
fi

# Extract components
PROTOCOL="${PARTS[0]}"      # KINETIC
SWITCH_ID="${PARTS[1]}"     # AB6EDE
SWITCH_NAME="${PARTS[2]}"    # BUTTON_1
RECEIVER="${PARTS[3]}"      # ESP32_RX_01
SIGNAL="${PARTS[4]:-}"      # -44dBm (optional)

#-----------------------------------------------------------------------------
# BUTTON NUMBER EXTRACTION
#-----------------------------------------------------------------------------

# Extract button number from BUTTON_N format
BUTTON_NUMBER="1"

#-----------------------------------------------------------------------------
# OUTPUT
#-----------------------------------------------------------------------------

# Output universal format with extra info
# Format: SWITCH_ID BUTTON_NUMBER SOURCE_TYPE [EXTRA_INFO...]
echo "${SWITCH_ID} ${BUTTON_NUMBER} KINETIC ${RECEIVER} ${SIGNAL}"

exit 0
