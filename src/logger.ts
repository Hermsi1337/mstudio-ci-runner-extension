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
        settings = { level: env.LOG_LEVEL, format: env.LOG_FORMAT };
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

function formatValue(key: string, value: unknown, level: LogLevel): string {
    if (key === "error" && typeof value === "object" && value !== null) {
        const { message, stack } = value as { message: string; stack?: string };
        return level === "error" && stack
            ? `error="${message}"\n${stack}`
            : `error="${message}"`;
    }
    if (typeof value === "string") {
        return `${key}=${/\s/.test(value) ? JSON.stringify(value) : value}`;
    }
    return `${key}=${JSON.stringify(value)}`;
}

function formatText(
    time: string,
    level: LogLevel,
    scope: string,
    message: string,
    fields: Fields,
): string {
    const extra = Object.entries(fields)
        .map(([key, value]) => formatValue(key, value, level))
        .join(" ");
    return `${time} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${extra ? ` ${extra}` : ""}`;
}

function write(
    level: LogLevel,
    scope: string,
    message: string,
    fields: Fields,
) {
    const { level: configured, format } = getSettings();
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
            : formatText(time, level, scope, message, normalized);
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
