#!/usr/bin/env bash
set -u
: "${EXPECTED_RUNNER_VERSION:?EXPECTED_RUNNER_VERSION is required}"

source "$(dirname "$0")/probe.sh"
source "$(dirname "$0")/common.sh"

expect "actions runner installed" test -x /home/runner/bin/Runner.Listener
expect_output "actions runner version" "${EXPECTED_RUNNER_VERSION}" \
    bash -c "cd /home/runner && ./config.sh --version"
expect_output "docker shim moves externals mounts to MSTUDIO_EXTERNALS" "-v /work/externals/2:/__e:ro" \
    bash -c "MSTUDIO_EXTERNALS=/work/externals/2 DOCKER_HOST=tcp://127.0.0.1:1 bash -x /usr/local/bin/docker create -v /home/runner/externals:/__e:ro alpine 2>&1"
expect_output "docker shim keeps externals mounts without MSTUDIO_EXTERNALS" "-v /home/runner/externals:/__e:ro" \
    bash -c "unset MSTUDIO_EXTERNALS; DOCKER_HOST=tcp://127.0.0.1:1 bash -x /usr/local/bin/docker create -v /home/runner/externals:/__e:ro alpine 2>&1"

finish
