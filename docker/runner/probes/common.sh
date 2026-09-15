#!/usr/bin/env bash

expect_output "runs as user runner" "runner" id -un
expect "runs unprivileged" test "$(id -u)" -ne 0
expect_output "sudo gives root" "0" sudo -n id -u
expect "apt-get install works" sudo bash -c "apt-get update -qq && apt-get install -y -qq hello"

for tool in git curl jq unzip zip tar gzip xz rsync ssh python3 pip3 gcc make; do
    expect "tool ${tool}" command -v "${tool}"
done

expect "HOME writable" touch "${HOME}/.probe-write"
expect "/tmp writable" touch /tmp/.probe-write

probe_dir="$(mktemp -d)"
echo probe >"${probe_dir}/file"
expect "symlink" ln -s file "${probe_dir}/link"
expect "hardlink" ln "${probe_dir}/file" "${probe_dir}/hard"
printf '#!/bin/sh\necho ok\n' >"${probe_dir}/run"
chmod +x "${probe_dir}/run"
expect_output "exec bit" "ok" "${probe_dir}/run"

expect "trim-cache.sh executable" test -x /usr/local/bin/trim-cache.sh
