#!/usr/bin/env bash
set -u
: "${EXPECTED_RUNNER_VERSION:?EXPECTED_RUNNER_VERSION is required}"

source "$(dirname "$0")/probe.sh"
source "$(dirname "$0")/common.sh"

expect "tool git-lfs" command -v git-lfs
expect_output "gitlab-runner version" "${EXPECTED_RUNNER_VERSION}" gitlab-runner --version

finish
