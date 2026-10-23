import {
    generateKeyPairSync,
    type KeyObject,
    randomUUID,
    sign,
} from "node:crypto";
import { once } from "node:events";
import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

export interface SessionTokenClaims {
    userId: string;
    extensionId: string;
    extensionInstanceId: string;
    contextId: string;
}

export interface SessionTokenApi {
    /** Base URL for `MW_EXT_API_URL`. */
    url: string;
    issue(claims: SessionTokenClaims): string;
    stop(): Promise<void>;
}

const publicKeySerial = "test-key";

/**
 * Stands in for the two endpoints `@mittwald/ext-bridge/node` calls under
 * `MW_EXT_API_URL`: the public key `verify()` checks the token against, and
 * the exchange of a session token for an access token. Tokens are signed with
 * a key pair generated per run, so the middleware verifies them unchanged.
 */
export async function startSessionTokenApi(
    extensionSecret: string,
): Promise<SessionTokenApi> {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey
        .export({ type: "spki", format: "pem" })
        .toString();

    const server = createServer(async (request, response) => {
        const { pathname } = new URL(request.url ?? "/", "http://localhost");
        if (
            request.method === "GET" &&
            pathname === `/v2/public-keys/${publicKeySerial}`
        ) {
            respond(response, 200, { key: publicKeyPem });
            return;
        }
        if (
            request.method === "POST" &&
            pathname === "/v2/authenticate-session-token"
        ) {
            const body = JSON.parse(await readBody(request));
            if (body.extensionSecret !== extensionSecret) {
                respond(response, 401, { message: "invalid secret" });
                return;
            }
            respond(response, 201, {
                publicToken: `access-${randomUUID()}`,
                expiry: new Date(Date.now() + 3_600_000).toISOString(),
            });
            return;
        }
        respond(response, 404, { message: "not found" });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;

    return {
        url: `http://127.0.0.1:${port}`,
        issue: (claims) => signToken(claims, privateKey),
        stop: async () => {
            server.close();
            await once(server, "close");
        },
    };
}

function signToken(claims: SessionTokenClaims, privateKey: KeyObject): string {
    const now = Math.floor(Date.now() / 1000);
    const [header, payload] = [
        { alg: "EdDSA", typ: "JWT" },
        {
            sub: claims.userId,
            sessionId: randomUUID(),
            extensionId: claims.extensionId,
            extensionInstanceId: claims.extensionInstanceId,
            contextId: claims.contextId,
            context: "project",
            scopes: [],
            authenticatableWithoutSecret: false,
            publicKeySerial,
            iat: now,
            exp: now + 600,
        },
    ].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"));
    const signature = sign(
        null,
        Buffer.from(`${header}.${payload}`),
        privateKey,
    ).toString("base64url");
    return `${header}.${payload}.${signature}`;
}

function respond(response: ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
}
