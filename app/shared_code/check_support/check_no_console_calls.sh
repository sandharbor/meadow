#!/bin/bash
# Shared check for direct console.* calls
# Usage: source this file or call check_no_console_calls <directory> [--strict]
#
# This ensures code uses the logger from shared_code/utils/loggingUtils.ts
# instead of direct console.log/error/warn/debug/info calls.
#
# By default, violations are warnings. Pass --strict to fail on violations.

check_no_console_calls() {
    local search_dir="${1:-.}"
    local strict_mode=false

    if [ "$2" = "--strict" ]; then
        strict_mode=true
    fi

    echo "🔍 Checking for direct console.* calls..."

    CONSOLE_VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" \
        --exclude-dir="node_modules" \
        -E "console\.(log|error|warn|debug|info)\(" \
        "$search_dir" 2>/dev/null | \
        grep -v "eslint-disable" | \
        grep -v "loggingUtils" | \
        grep -v "backendLoggingUtils" | \
        grep -v "utils/logging/logfiles" | \
        grep -v "utils/logger\.ts" | \
        grep -v "siteLogger" | \
        grep -v "\.test\." | \
        grep -v "__tests__" | \
        grep -v "migrations/versions" || true)

    if [ -n "$CONSOLE_VIOLATIONS" ]; then
        local count=$(echo "$CONSOLE_VIOLATIONS" | wc -l | tr -d ' ')
        if [ "$strict_mode" = true ]; then
            echo "❌ Found $count direct console.* calls. Use logger from shared_code/utils/loggingUtils.ts instead:"
            echo "$CONSOLE_VIOLATIONS"
            return 1
        else
            echo "⚠️  Found $count direct console.* calls (warning only - use --strict to fail)"
            echo "   These should be migrated to use logger from shared_code/utils/loggingUtils.ts"
            return 0
        fi
    fi

    echo "✅ No direct console.* calls found"
    return 0
}

# If script is run directly (not sourced), execute the check
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_no_console_calls "$@"
fi
