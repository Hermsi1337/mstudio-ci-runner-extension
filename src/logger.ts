import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { getEnvironmentVariables } from "./env";

export const logLevels = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof logLevels)[number];
export const logFormats = ["json", "text"] as const;
export type LogFormat = (typeof logFormats)[number];

type Fields = Record<string, unknown>;

interface LoggerSettings {
    level: LogLevel;
    format: LogFormat;
    color: boolean;
}

const ansi = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
};

const levelColors: Record<LogLevel, string> = {
    debug: ansi.gray,
    info: ansi.green,
    warn: ansi.yellow,
    error: ansi.red,
};

/**
 * Follows the NO_COLOR and FORCE_COLOR conventions; otherwise colors only when
 * both streams are terminals, so piped or captured output stays plain.
 */
function detectColor(): boolean {
    if (process.env.NO_COLOR !== undefined) {
        return false;
    }
    if (process.env.FORCE_COLOR !== undefined) {
        return process.env.FORCE_COLOR !== "0";
    }
    return Boolean(process.stdout.isTTY && process.stderr.isTTY);
}

let settings: LoggerSettings | undefined;
const requestContext = new AsyncLocalStorage<Fields>();

/**
 * Fields set here appear on every log line written while `fn` runs, including
 * detached work started inside it. Used per request for requestId and identity.
 */
export function withLogContext<T>(
    fields: Fields,
    fn: () => Promise<T>,
): Promise<T> {
    return requestContext.run({ ...requestContext.getStore(), ...fields }, fn);
}

export function addLogContext(fields: Fields) {
    const store = requestContext.getStore();
    if (store) {
        Object.assign(store, fields);
    }
}

export function newRequestId(): string {
    return randomUUID().slice(0, 8);
}

function getSettings(): LoggerSettings {
    if (!settings) {
        const env = getEnvironmentVariables();
        settings = {
            level: env.LOG_LEVEL,
            format: env.LOG_FORMAT,
            color: env.LOG_FORMAT === "text" && detectColor(),
        };
    }
    return settings;
}

function serializeError(error: unknown) {
    if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
}

function normalizeFields(fields: Fields): Fields {
    return Object.fromEntries(
        Object.entries(fields)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [
                key,
                key === "error" ? serializeError(value) : value,
            ]),
    );
}

function paint(text: string, color: string, enabled: boolean): string {
    return enabled ? `${color}${text}${ansi.reset}` : text;
}

function formatValue(
    key: string,
    value: unknown,
    level: LogLevel,
    color: boolean,
): string {
    const name = paint(key, ansi.dim, color);
    if (key === "error" && typeof value === "object" && value !== null) {
        const { message, stack } = value as { message: string; stack?: string };
        const text = paint(`"${message}"`, ansi.red, color);
        return level === "error" && stack
            ? `${name}=${text}\n${paint(stack, ansi.gray, color)}`
            : `${name}=${text}`;
    }
    if (typeof value === "string") {
        return `${name}=${/\s/.test(value) ? JSON.stringify(value) : value}`;
    }
    return `${name}=${JSON.stringify(value)}`;
}

function formatText(
    time: string,
    level: LogLevel,
    scope: string,
    message: string,
    fields: Fields,
    color: boolean,
): string {
    const extra = Object.entries(fields)
        .map(([key, value]) => formatValue(key, value, level, color))
        .join(" ");
    const parts = [
        paint(time, ansi.dim, color),
        paint(level.toUpperCase().padEnd(5), levelColors[level], color),
        paint(`[${scope}]`, ansi.cyan, color),
        message,
    ];
    return `${parts.join(" ")}${extra ? ` ${extra}` : ""}`;
}

function write(
    level: LogLevel,
    scope: string,
    message: string,
    fields: Fields,
) {
    const { level: configured, format, color } = getSettings();
    if (logLevels.indexOf(level) < logLevels.indexOf(configured)) {
        return;
    }
    const time = new Date().toISOString();
    const normalized = normalizeFields({
        ...requestContext.getStore(),
        ...fields,
    });
    const line =
        format === "json"
            ? JSON.stringify({ time, level, scope, message, ...normalized })
            : formatText(time, level, scope, message, normalized, color);
    const stream =
        level === "debug" || level === "info" ? process.stdout : process.stderr;
    stream.write(`${line}\n`);
}

export interface Logger {
    debug(message: string, fields?: Fields): void;
    info(message: string, fields?: Fields): void;
    warn(message: string, fields?: Fields): void;
    error(message: string, fields?: Fields): void;
}

export function createLogger(scope: string): Logger {
    return {
        debug: (message, fields = {}) => write("debug", scope, message, fields),
        info: (message, fields = {}) => write("info", scope, message, fields),
        warn: (message, fields = {}) => write("warn", scope, message, fields),
        error: (message, fields = {}) => write("error", scope, message, fields),
    };
}
