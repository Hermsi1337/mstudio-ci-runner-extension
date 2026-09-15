/**
 * Keeps only the upstream paths the extension uses, prunes unused definitions
 * and drops security requirements. Supports OpenAPI 3 and Swagger 2.
 * The output feeds client generation and the Prism mocks of the tests.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

type Json = Record<string, unknown>;

interface Source {
    name: string;
    url: string;
    paths: string[];
    serverUrl?: string;
    patch?: (doc: Json) => void;
}

const sources: Source[] = [
    {
        name: "mittwald-v2",
        url: "https://api.mittwald.de/v2/openapi.json",
        serverUrl: "https://api.mittwald.de",
        paths: [
            "/v2/projects/{projectId}/stacks",
            "/v2/stacks/{stackId}",
            "/v2/stacks/{stackId}/services/{serviceId}",
            "/v2/stacks/{stackId}/services/{serviceId}/logs",
            "/v2/stacks/{stackId}/services/{serviceId}/actions/restart",
            "/v2/stacks/{stackId}/services/{serviceId}/actions/recreate",
            "/v2/stacks/{stackId}/volumes",
            "/v2/stacks/{stackId}/volumes/{volumeId}",
            "/v2/projects/{projectId}/cronjobs",
            "/v2/cronjobs/{cronjobId}",
            "/v2/extension-instances/{extensionInstanceId}/tokens",
            "/v2/authenticate-session-token",
            "/v2/public-keys/{serial}",
        ],
    },
    {
        name: "github",
        url: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
        serverUrl: "https://api.github.com",
        paths: [
            "/repos/{owner}/{repo}/actions/runners",
            "/orgs/{org}/actions/runners",
            "/repos/{owner}/{repo}/actions/runners/registration-token",
            "/orgs/{org}/actions/runners/registration-token",
            "/repos/{owner}/{repo}/actions/runners/remove-token",
            "/orgs/{org}/actions/runners/remove-token",
            "/repos/{owner}/{repo}/releases",
        ],
    },
    {
        name: "gitlab",
        url: "https://gitlab.com/gitlab-org/gitlab/-/raw/master/doc/api/openapi/openapi_v2.yaml",
        paths: [
            "/api/v4/user/runners",
            "/api/v4/runners",
            "/api/v4/runners/verify",
            "/api/v4/projects/{id}",
            "/api/v4/groups/{id}",
        ],
        patch: (doc) => {
            // upstream marks group_id and project_id as required although they depend on runner_type
            const create = (doc.definitions as Json)
                .postApiV4UserRunners as Json;
            create.required = ["runner_type"];
        },
    },
];

function collectRefs(node: unknown, refs: Set<string>): void {
    if (Array.isArray(node)) {
        for (const item of node) collectRefs(item, refs);
        return;
    }
    if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node as Json)) {
            if (key === "$ref" && typeof value === "string") {
                refs.add(value);
            } else {
                collectRefs(value, refs);
            }
        }
    }
}

function pointerSegments(ref: string): string[] {
    return ref
        .replace(/^#\//, "")
        .split("/")
        .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function resolve(doc: Json, ref: string): unknown {
    return pointerSegments(ref).reduce<unknown>(
        (node, part) => (node as Json)?.[part],
        doc,
    );
}

function setAt(doc: Json, ref: string, value: unknown): void {
    const segments = pointerSegments(ref);
    let node: Json = doc;
    for (const part of segments.slice(0, -1)) {
        if (!node[part]) {
            node[part] = {};
        }
        node = node[part] as Json;
    }
    node[segments[segments.length - 1]] = value;
}

function stripSecurity(node: unknown): void {
    if (Array.isArray(node)) {
        for (const item of node) stripSecurity(item);
        return;
    }
    if (node && typeof node === "object") {
        delete (node as Json).security;
        for (const value of Object.values(node as Json)) stripSecurity(value);
    }
}

function slim(doc: Json, source: Source): Json {
    const allPaths = doc.paths as Json;
    const paths: Json = {};
    for (const p of source.paths) {
        if (!allPaths[p])
            throw new Error(`${source.name}: path ${p} not found`);
        paths[p] = allPaths[p];
    }

    const result: Json = { paths };
    for (const key of [
        "openapi",
        "swagger",
        "info",
        "host",
        "basePath",
        "schemes",
    ]) {
        if (doc[key] !== undefined) result[key] = doc[key];
    }
    result.info = {
        ...(doc.info as Json),
        title: `${(doc.info as Json).title} (subset)`,
    };
    if (source.serverUrl) {
        result.servers = [{ url: source.serverUrl }];
    }

    const refs = new Set<string>();
    collectRefs(paths, refs);
    const seen = new Set<string>();
    while (refs.size > seen.size) {
        for (const ref of [...refs]) {
            if (seen.has(ref)) continue;
            seen.add(ref);
            const target = resolve(doc, ref);
            if (target === undefined)
                throw new Error(`${source.name}: ${ref} not found`);
            setAt(result, ref, target);
            collectRefs(target, refs);
        }
    }

    stripSecurity(result);
    source.patch?.(result);
    return result;
}

const outDir = path.resolve("openapi/upstream");
await mkdir(outDir, { recursive: true });

for (const source of sources) {
    const response = await fetch(source.url);
    if (!response.ok) {
        throw new Error(`${source.url}: HTTP ${response.status}`);
    }
    const text = await response.text();
    const doc = (
        source.url.endsWith(".json") ? JSON.parse(text) : parseYaml(text)
    ) as Json;
    const slimmed = slim(doc, source);
    const file = path.join(outDir, `${source.name}.json`);
    await writeFile(file, `${JSON.stringify(slimmed, null, 2)}\n`);
    console.log(`${file}: ${Object.keys(slimmed.paths as Json).length} paths`);
}
