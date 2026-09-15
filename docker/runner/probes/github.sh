#!/usr/bin/env bash
set -u
: "${EXPECTED_RUNNER_VERSION:?EXPECTED_RUNNER_VERSION is required}"

source "$(dirname "$0")/probe.sh"
source "$(dirname "$0")/common.sh"

expect "actions runner installed" test -x /home/runner/bin/Runner.Listener
expect_output "actions runner version" "${EXPECTED_RUNNER_VERSION}" \
    bash -c "cd /home/runner && ./config.sh --version"

finish
