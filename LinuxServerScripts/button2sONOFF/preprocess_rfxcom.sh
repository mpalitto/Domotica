#!/bin/bash
#=============================================================================
# RFXCOM PREPROCESSOR
#
# PURPOSE:
#   Converts RFXCOM raw format to universal format for the main switch handler.
#
# INPUT FORMAT (RFXCOM):
#   0A140000B1E4610157C002
#   ^^^^^^^                - Header (0A1400)
#          ^^^^^           - Switch ID (positions 9-13, e.g., B1E46)
#                   ^      - Button number (position 17)
#
# OUTPUT FORMAT (Universal):
#   SWITCH_ID BUTTON_NUMBER SOURCE_TYPE
#   Example: B1E46 5 RFXCOM
#
# EXIT CODES:
#   0 - Success
#   1 - Invalid input format
#
# USAGE:
#   ./preprocess_rfxcom.sh "0A1400aF4A0E91005116441315nodeMCU-0"
#=============================================================================

# Enable strict mode
set -euo pipefail

# Input: raw line from RFXCOM
RAW_LINE="${1:-}"
# echo "\"$RAW_LINE\""

#-----------------------------------------------------------------------------
# VALIDATION
#-----------------------------------------------------------------------------

# Check if input is provided
if [[ -z "$RAW_LINE" ]]; then
    echo "INVALID" 
    exit 1
fi

# Validate RFXCOM header
# RFXCOM lighting4 messages start with 0A1400
RFXCOM_HEADER="0A1400"
if [[ "${RAW_LINE:0:6}" != "$RFXCOM_HEADER" ]]; then
    echo "INVALID"
    exit 1
fi

# Minimum length check (need at least 18 characters to extract ID and button)
if [[ ${#RAW_LINE} -lt 18 ]]; then
    echo "INVALID"
    exit 1
fi

#-----------------------------------------------------------------------------
# PARSING
#-----------------------------------------------------------------------------

# Extract switch ID from positions 9-13 (5 characters)
# In the original code: ${line:9:5}
SWITCH_ID="${RAW_LINE:9:5}"

# Extract button type from position 14 (3 character)
# In the original code: ${line:14:3}
BUTTON_TYPE="${RAW_LINE:14:3}"

# Extract button number from position 17 (1 character)
# In the original code: ${line:17:1}
BUTTON_NUMBER="${RAW_LINE:17:1}"

#-----------------------------------------------------------------------------
# VALIDATION OF EXTRACTED DATA
#-----------------------------------------------------------------------------

# Validate switch ID is hexadecimal
if [[ ! "$SWITCH_ID" =~ ^[0-9A-Fa-f]+$ ]]; then
    echo "INVALID"
    exit 1
fi

# Validate button type is "010" or "110"
if [[ ! "$BUTTON_TYPE" =~ ^(010|110|100)$ ]]; then
    echo "INVALID"
    exit 1
fi
# Validate button number is a digit (0-9)
if [[ ! "$BUTTON_NUMBER" =~ ^[0-9]$ ]]; then
    echo "INVALID"
    exit 1
fi

#-----------------------------------------------------------------------------
# OUTPUT
#-----------------------------------------------------------------------------

# Output universal format: SWITCH_ID BUTTON_NUMBER SOURCE_TYPE
echo "${SWITCH_ID} ${BUTTON_NUMBER} RFXCOM"

exit 0
