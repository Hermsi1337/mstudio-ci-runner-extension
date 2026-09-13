export const localModeHeader = "x-local-mode";

let enabled = false;

export function enableLocalMode() {
    enabled = true;
}

export function isLocalModeEnabled() {
    return enabled;
}
