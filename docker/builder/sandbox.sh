#!/usr/bin/env bash
# Runs a command as root of a user namespace in which the kernel hands binaries
# of the other architecture to qemu.
#
# Container Hosting gives the builder no privileges, but since Linux 6.7 every
# user namespace can mount its own binfmt_misc. Inside a fresh user and mount
# namespace this script registers qemu for the other architecture and then runs
# the command, chrooted into a root directory when one is given. kaniko runs
# there with an emulated RUN step as if the architecture were native.
#
# Mapping uid 0 of the container into a namespace needs CAP_SETFCAP, which the
# builder lacks. So uid 1 owns the namespace and the map is "0 1 65535": root
# inside is uid 1 outside, and container uid 0 stays unmapped. The map is
# written by a second uid 1 process that keeps CAP_SETUID and CAP_SETGID as
# ambient capabilities, which is what the kernel asks of a writer that maps
# more than its own id. A root directory for a build has to belong to uid 1.
#
# Usage:
#   sandbox.sh run ROOT|- COMMAND [ARGS ...]
set -euo pipefail

owner=1
id_count=65535
emulation_dir=/kaniko/emulation

# Magic and mask from qemu's scripts/qemu-binfmt-conf.sh.
declare -A magic=(
    [aarch64]='\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\xb7\x00'
    [x86_64]='\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\x3e\x00'
)
declare -A mask=(
    [aarch64]='\xff\xff\xff\xff\xff\xff\xff\x00\xff\xff\xff\xff\xff\xff\xff\xff\xfe\xff\xff\xff'
    [x86_64]='\xff\xff\xff\xff\xff\xfe\xfe\x00\xff\xff\xff\xff\xff\xff\xff\xff\xfe\xff\xff\xff'
)

run() {
    local pid_file child pid
    pid_file="$(mktemp)"
    chmod 0666 "${pid_file}"

    # The child waits until its map is written. Only then does exec give it the
    # capabilities of root inside the namespace.
    setpriv --reuid="${owner}" --regid="${owner}" --clear-groups \
        unshare --user --mount --propagation private \
        bash -c 'echo "$$" >"$0"; until read -r line </proc/self/uid_map && [[ -n "${line}" ]]; do sleep 0.05; done; exec "$@"' \
        "${pid_file}" "$0" inner "$@" &
    child=$!

    until [[ -s "${pid_file}" ]]; do
        if ! kill -0 "${child}" 2>/dev/null; then
            wait "${child}"
            return 1
        fi
        sleep 0.05
    done
    read -r pid <"${pid_file}"
    rm -f "${pid_file}"

    # The kernel takes a map in a single write. bash on musl splits the line
    # into two writes and gets EINVAL, busybox sh writes it at once.
    if ! setpriv --reuid="${owner}" --regid="${owner}" --clear-groups \
        --inh-caps=+setuid,+setgid --ambient-caps=+setuid,+setgid \
        sh -c 'echo "0 $1 $2" >"/proc/$0/uid_map" && echo "0 $1 $2" >"/proc/$0/gid_map"' \
        "${pid}" "${owner}" "${id_count}"; then
        kill "${child}" 2>/dev/null || true
        wait "${child}" || true
        return 1
    fi
    wait "${child}"
}

inner() {
    local root="$1"
    shift

    local binfmt qemu arch
    binfmt="$(mktemp -d)"
    mount -t binfmt_misc binfmt_misc "${binfmt}"
    for qemu in "${emulation_dir}"/qemu-*; do
        arch="${qemu##*/qemu-}"
        # F opens the interpreter now, so it works after the chroot as well.
        printf '%s' ":qemu-${arch}:M::${magic[${arch}]}:${mask[${arch}]}:${qemu}:F" >"${binfmt}/register"
    done

    if [[ "${root}" == "-" ]]; then
        exec "$@"
    fi

    mount -o rbind /proc "${root}/proc"
    mount -o rbind /dev "${root}/dev"
    # Some tools read /sys, kaniko does not need it. A kernel that refuses the
    # bind still runs the build.
    mount -o rbind /sys "${root}/sys" 2>/dev/null || true
    mount -o bind /etc/resolv.conf "${root}/etc/resolv.conf"
    mount -o bind /etc/hosts "${root}/etc/hosts"
    exec chroot "${root}" "$@"
}

command="${1:?usage: sandbox.sh run ROOT|- COMMAND [ARGS ...]}"
shift
case "${command}" in
    run) run "$@" ;;
    inner) inner "$@" ;;
    *) echo "sandbox.sh: unknown command ${command}" >&2; exit 2 ;;
esac
