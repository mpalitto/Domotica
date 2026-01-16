#!/bin/bash
#=============================================================================
# [PROTOCOL NAME] PREPROCESSOR TEMPLATE
#
# PURPOSE:
#   Converts [PROTOCOL NAME] raw format to universal format for the main 
#   switch handler.
#
# INPUT FORMAT:
#   [Describe the input format here]
#   [Show an example]
#
# OUTPUT FORMAT (Universal):
#   SWITCH_ID BUTTON_NUMBER SOURCE_TYPE [EXTRA_INFO...]
#   Example: XXXXX 1 PROTOCOL_NAME
#
# EXIT CODES:
#   0 - Success
#   1 - Invalid input format
#
# USAGE:
#   ./preprocess_[protocol].sh "[raw input line]"
#
# INSTRUCTIONS FOR NEW PREPROCESSORS:
#   1. Copy this template to preprocess_[protocol].sh
#   2. Replace [PROTOCOL NAME] with your protocol name
#   3. Update INPUT FORMAT documentation
#   4. Implement the parsing logic
#   5. Make the script executable: chmod +x preprocess_[protocol].sh
#   6. Update detect_source_type() in main switch.sh to recognize your format
#=============================================================================

# Enable strict mode
set -euo pipefail

# Input: raw line from the device
RAW_LINE="${1:-}"

#-----------------------------------------------------------------------------
# CONFIGURATION
# Modify these values for your protocol
#-----------------------------------------------------------------------------

PROTOCOL_NAME="PROTOCOL"  # Used in output as SOURCE_TYPE
PROTOCOL_HEADER="XXX"     # Expected start of valid lines (for validation)

#-----------------------------------------------------------------------------
# VALIDATION
#-----------------------------------------------------------------------------

# Check if input is provided
if [[ -z "$RAW_LINE" ]]; then
    echo "INVALID"
    exit 1
fi

# Check if line starts with expected header
if [[ "${RAW_LINE:0:${#PROTOCOL_HEADER}}" != "$PROTOCOL_HEADER" ]]; then
    echo "INVALID"
    exit 1
fi

#-----------------------------------------------------------------------------
# PARSING
# Implement your parsing logic here
#-----------------------------------------------------------------------------

# Example: parsing a space-separated format
# read -ra PARTS <<< "$RAW_LINE"
# SWITCH_ID="${PARTS[0]}"
# BUTTON_NUMBER="${PARTS[1]}"

# Example: parsing fixed-position format
# SWITCH_ID="${RAW_LINE:10:5}"
# BUTTON_NUMBER="${RAW_LINE:20:1}"

# TODO: Implement your parsing logic
SWITCH_ID="XXXXX"
BUTTON_NUMBER="0"

#-----------------------------------------------------------------------------
# VALIDATION OF EXTRACTED DATA
#-----------------------------------------------------------------------------

# Validate switch ID (adjust pattern as needed)
if [[ ! "$SWITCH_ID" =~ ^[0-9A-Fa-f]+$ ]]; then
    echo "INVALID"
    exit 1
fi

# Validate button number
if [[ ! "$BUTTON_NUMBER" =~ ^[0-9]+$ ]]; then
    echo "INVALID"
    exit 1
fi

#-----------------------------------------------------------------------------
# OUTPUT
#-----------------------------------------------------------------------------

# Output universal format
echo "${SWITCH_ID} ${BUTTON_NUMBER} ${PROTOCOL_NAME}"

exit 0
