import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { type AddressInfo, createServer } from "node:net";
import { promisify } from "node:util";
import { defaultSerovalDeserializerPlugins } from "@tanstack/react-start";
import { fromCrossJSON, toJSONAsync } from "seroval";

export interface ServerFunction {
    /** Source file relative to the repository root. */
    file: string;
    /** Exported name of the `createServerFn` result. */
    name: string;
    method: "GET" | "POST";
}

export interface ServerFunctionCall {
    data?: unknown;
    headers?: Record<string, string>;
}

/** What the client unwraps: `result` on success, the thrown error otherwise. */
export interface ServerFunctionResponse {
    result?: unknown;
    error?: unknown;
}

export interface ExtensionServer {
    url: string;
    call(
        fn: ServerFunction,
        options?: ServerFunctionCall,
    ): Promise<ServerFunctionResponse>;
    stop(): Promise<void>;
}

/** Same output as `pnpm run build`, so the tests run what the image ships. */
export async function buildServer(): Promise<void> {
    await promisify(execFile)("pnpm", ["run", "build"], {
        maxBuffer: 64 * 1024 * 1024,
    });
}

/**
 * Starts `.output/server/index.mjs` with the current process environment plus
 * `env`. Call `buildServer` first.
 */
export async function startServer(
    env: Record<string, string>,
): Promise<ExtensionServer> {
    const port = await freePort();
    const child = spawn(process.execPath, [".output/server/index.mjs"], {
        env: { ...process.env, ...env, PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
        output += chunk;
    });
    child.stderr.on("data", (chunk) => {
        output += chunk;
    });
    const url = `http://127.0.0.1:${port}`;

    const deadline = Date.now() + 30_000;
    while (!(await reachable(url))) {
        if (child.exitCode !== null || Date.now() > deadline) {
            child.kill();
            throw new Error(`extension server did not start:\n${output}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return {
        url,
        call: (fn, options) => callServerFunction(url, fn, options),
        stop: async () => {
            if (child.exitCode === null) {
                child.kill();
                await once(child, "exit");
            }
        },
    };
}

/**
 * Speaks the wire format of the TanStack Start client: the function id the
 * build derives from file and export name, and seroval payloads in both
 * directions with the plugins the client uses. Results and errors of a
 * function both come back with 200; anything else never reached it, such as
 * an id scheme that changed after an upgrade ("Server function info not
 * found").
 */
async function callServerFunction(
    baseUrl: string,
    fn: ServerFunction,
    { data, headers = {} }: ServerFunctionCall = {},
): Promise<ServerFunctionResponse> {
    const id = createHash("sha256")
        .update(`${fn.file}--${fn.name}_createServerFn_handler`)
        .digest("hex");
    const url = new URL(`/_serverFn/${id}`, baseUrl);
    const payload =
        data === undefined
            ? undefined
            : JSON.stringify(
                  await toJSONAsync(
                      { data },
                      { plugins: defaultSerovalDeserializerPlugins },
                  ),
              );
    if (fn.method === "GET" && payload !== undefined) {
        url.searchParams.set("payload", payload);
    }

    const response = await fetch(url, {
        method: fn.method,
        headers: {
            ...headers,
            "x-tsr-serverFn": "true",
            accept: "application/json",
            ...(fn.method === "POST" && { "content-type": "application/json" }),
        },
        body: fn.method === "POST" ? payload : undefined,
    });
    if (response.status !== 200) {
        throw new Error(
            `server function ${fn.name} answered ${response.status}: ${await response.text()}`,
        );
    }
    return fromCrossJSON(await response.json(), {
        refs: new Map(),
        plugins: defaultSerovalDeserializerPlugins,
    }) as ServerFunctionResponse;
}

async function freePort(): Promise<number> {
    const server = createServer().listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    server.close();
    await once(server, "close");
    return port;
}

async function reachable(url: string): Promise<boolean> {
    try {
        await fetch(url);
        return true;
    } catch {
        return false;
    }
}
