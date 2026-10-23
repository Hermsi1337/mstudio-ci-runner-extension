import { type ChildProcess, execFile, spawn } from "node:child_process";
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
 * `env`. Call `buildServer` first. Start-up counts once the child itself
 * reports listening on the port, so a foreign process on that port fails the
 * start instead of answering the tests.
 */
export async function startServer(
    env: Record<string, string>,
): Promise<ExtensionServer> {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ...env,
        HOST: "127.0.0.1",
        PORT: String(port),
    };
    // srvx stays silent about the listening address while TEST is set.
    delete childEnv.TEST;
    const child = spawn(process.execPath, [".output/server/index.mjs"], {
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
    });

    try {
        await waitForListening(child, url);
    } catch (error) {
        await terminate(child);
        throw error;
    }

    return {
        url,
        call: (fn, options) => callServerFunction(url, fn, options),
        stop: () => terminate(child),
    };
}

function waitForListening(child: ChildProcess, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        let output = "";
        const fail = (reason: string) => {
            clearTimeout(timeout);
            reject(
                new Error(
                    `extension server did not start (${reason}):\n${output}`,
                ),
            );
        };
        const timeout = setTimeout(() => fail("timed out"), 30_000);
        const collect = (chunk: Buffer) => {
            output += chunk;
            if (output.includes(`Listening on: ${url}/`)) {
                clearTimeout(timeout);
                resolve();
            }
        };
        child.stdout?.on("data", collect);
        child.stderr?.on("data", collect);
        child.once("error", (error) => fail(error.message));
        child.once("exit", (code, signal) =>
            fail(`exited with ${signal ?? code}`),
        );
    });
}

async function terminate(child: ChildProcess): Promise<void> {
    if (
        child.pid === undefined ||
        child.exitCode !== null ||
        child.signalCode !== null
    ) {
        return;
    }
    const exited = once(child, "exit");
    child.kill();
    await exited;
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
