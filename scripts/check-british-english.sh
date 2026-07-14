#!/bin/bash

# British English compliance checker
# Checks for American English spellings and suggests British alternatives
# Can check entire src/ directory or specific files passed as arguments

set -e

# Define American spellings that should be avoided
AMERICAN_WORDS=(
  "color"
  "flavor" 
  "center"
  "defense"
  "authorize"
  "organize"
  "serialize"
  "initialize"
  "realize"
  "analyze"
  "finalize"
  "normalize"
  "synchronize"
  "optimize"
  "utilize"
  "modernize"
  "behavior"
  "prioritize"
  "sanitize"
  "catalog"
  "gray"
)

# Corresponding British spellings
BRITISH_WORDS=(
  "colour"
  "flavour"
  "centre"
  "defence"
  "authorise"
  "organise"
  "serialise"
  "initialise"
  "realise"
  "analyse"
  "finalise"
  "normalise"
  "synchronise"
  "optimise"
  "utilise"
  "modernise"
  "behaviour"
  "prioritise"
  "sanitise"
  "catalogue"
  "grey"
)

# Build regex pattern with word boundaries
PATTERN=""
for word in "${AMERICAN_WORDS[@]}"; do
  if [ -n "$PATTERN" ]; then
    PATTERN="$PATTERN|"
  fi
  PATTERN="$PATTERN\\b$word\\b"
done

# Determine what to check
if [ $# -eq 0 ]; then
  # No arguments - check entire src/ directory 
  echo "🔍 Checking for American English spellings in source code..."
  TARGET="src/"
  GREP_ARGS="--include=*.ts --include=*.js --exclude-dir=node_modules"
else
  # Arguments provided - check specific files (for lint-staged)
  echo "🔍 Checking for American English spellings in staged files..."
  TARGET="$*"
  GREP_ARGS=""
fi

# Check for American spellings
if [ $# -eq 0 ]; then
  # Check directory
  if grep -rE "($PATTERN)" $TARGET $GREP_ARGS; then
    echo ""
    echo "❌ Found American English spellings. Please use British English alternatives:"
    echo ""
    for i in "${!AMERICAN_WORDS[@]}"; do
      echo "  ${AMERICAN_WORDS[$i]} → ${BRITISH_WORDS[$i]}"
    done
    echo ""
    exit 1
  fi
else
  # Check individual files
  FOUND_ISSUES=false
  for file in "$@"; do
    # Only check TypeScript and JavaScript files
    if [[ "$file" == *.ts || "$file" == *.js ]]; then
      if [ -f "$file" ] && grep -E "($PATTERN)" "$file"; then
        FOUND_ISSUES=true
      fi
    fi
  done
  
  if [ "$FOUND_ISSUES" = true ]; then
    echo ""
    echo "❌ Found American English spellings. Please use British English alternatives:"
    echo ""
    for i in "${!AMERICAN_WORDS[@]}"; do
      echo "  ${AMERICAN_WORDS[$i]} → ${BRITISH_WORDS[$i]}"
    done
    echo ""
    exit 1
  fi
fi

echo "✅ British English compliance verified"
exit 0