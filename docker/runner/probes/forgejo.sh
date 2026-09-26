#!/usr/bin/env bash
set -u
: "${EXPECTED_RUNNER_VERSION:?EXPECTED_RUNNER_VERSION is required}"
: "${EXPECTED_NODE_VERSION:?EXPECTED_NODE_VERSION is required}"

source "$(dirname "$0")/probe.sh"
source "$(dirname "$0")/common.sh"

expect "tool git-lfs" command -v git-lfs
expect "tini reaps orphaned processes" \
    tini -s -- bash -c 'bash -c "sleep 0.2 &"; sleep 1; test "$(ps -eo stat= | grep -c "^Z")" -eq 0'
expect_output "forgejo-runner version" "v${EXPECTED_RUNNER_VERSION}" forgejo-runner --version
expect_output "node version" "v${EXPECTED_NODE_VERSION}" node --version
expect "tool npm" npm --version
expect "tool npx" command -v npx

npm_prefix="$(npm prefix -g 2>/dev/null)"
expect_output "npm global prefix in the runner home" "${HOME}/" echo "${npm_prefix}/"
expect "npm global prefix writable" test -w "${npm_prefix}"
expect "npm global bin in PATH" bash -c "[[ \":\${PATH}:\" == *\":${npm_prefix}/bin:\"* ]]"

npm_package="$(mktemp -d)"
printf '{"name":"mstudio-probe","version":"1.0.0","bin":{"mstudio-probe":"probe.js"}}' >"${npm_package}/package.json"
printf '#!/usr/bin/env node\nconsole.log("probe ok")\n' >"${npm_package}/probe.js"
expect "npm install -g works without sudo" npm install -g --offline --no-audit --no-fund "${npm_package}"
expect_output "globally installed bin runs" "probe ok" mstudio-probe

finish
