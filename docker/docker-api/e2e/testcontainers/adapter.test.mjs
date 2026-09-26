// Runs Testcontainers against the adapter. Needs DOCKER_HOST pointing at an
// adapter inside a mittwald stack; see docs in the README.
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, Network, Wait } from "testcontainers";

describe("testcontainers on mittwald", { timeout: 600_000 }, () => {
    let network;
    let pg;
    let web;

    before(async () => {
        network = await new Network().start();
    });

    after(async () => {
        await web?.stop();
        await pg?.stop();
        await network?.stop();
    });

    it("starts PostgreSQL and waits for its health check", async () => {
        pg = await new PostgreSqlContainer("postgres:16-alpine")
            .withNetwork(network)
            .withNetworkAliases("db")
            .start();
        const result = await pg.exec([
            "psql",
            "-U",
            pg.getUsername(),
            "-d",
            pg.getDatabase(),
            "-tAc",
            "select 6*7",
        ]);
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout.trim(), "42");
    });

    it("reaches a container through its mapped port", async () => {
        web = await new GenericContainer("python:3-alpine")
            .withCommand([
                "sh",
                "-c",
                "cd /srv && exec python3 -u -m http.server 8000",
            ])
            .withExposedPorts(8000)
            .withNetwork(network)
            .withNetworkAliases("web")
            .withCopyContentToContainer([
                { content: "hello from copy", target: "/srv/x.txt" },
            ])
            .withWaitStrategy(Wait.forLogMessage(/Serving HTTP/))
            .start();
        const res = await fetch(
            `http://${web.getHost()}:${web.getMappedPort(8000)}/x.txt`,
        );
        assert.equal(res.status, 200);
        assert.equal(await res.text(), "hello from copy");
    });

    it("resolves network aliases", async () => {
        const result = await web.exec(["sh", "-c", "nc -z -w 5 db 5432"]);
        assert.equal(result.exitCode, 0, result.output);
    });

    it("reports exec output per stream and the exit code", async () => {
        const result = await web.exec([
            "sh",
            "-c",
            "echo out; echo err >&2; exit 4",
        ]);
        assert.equal(result.exitCode, 4);
        assert.equal(result.stdout, "out\n");
        assert.equal(result.stderr, "err\n");
    });

    it("copies files into a running container and back", async () => {
        await web.copyContentToContainer([
            { content: "late copy", target: "/srv/late.txt" },
        ]);
        const result = await web.exec(["cat", "/srv/late.txt"]);
        assert.equal(result.stdout, "late copy");
        const archive = await web.copyArchiveFromContainer("/srv/late.txt");
        let bytes = 0;
        for await (const chunk of archive) bytes += chunk.length;
        assert.ok(bytes > 0);
    });

    it("waits for listening ports by default", async () => {
        const nginx = await new GenericContainer("nginx:alpine")
            .withExposedPorts(80)
            .start();
        const res = await fetch(
            `http://${nginx.getHost()}:${nginx.getMappedPort(80)}/`,
        );
        assert.equal(res.status, 200);
        await nginx.stop();
    });
});
