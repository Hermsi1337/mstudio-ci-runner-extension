#!/usr/bin/env bash
set -u

failures=0
results=()

expect() {
    local name="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        results+=("ok   ${name}")
    else
        results+=("FAIL ${name}")
        failures=$((failures + 1))
    fi
}

expect_output() {
    local name="$1" expected="$2"
    shift 2
    local actual
    actual="$("$@" 2>/dev/null)"
    if [[ "${actual}" == *"${expected}"* ]]; then
        results+=("ok   ${name}")
    else
        results+=("FAIL ${name} (expected '${expected}', got '${actual}')")
        failures=$((failures + 1))
    fi
}

finish() {
    printf '%s\n' "${results[@]}"
    if ((failures > 0)); then
        echo "${failures} probes failed"
        exit 1
    fi
    echo "all probes passed"
}
