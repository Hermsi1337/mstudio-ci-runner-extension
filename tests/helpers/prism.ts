import path from "node:path";
import {
    GenericContainer,
    type StartedTestContainer,
    Wait,
} from "testcontainers";

export const PRISM_IMAGE = "stoplight/prism:5.14.2";

export type UpstreamSpec = "mittwald-v2" | "github" | "gitlab";

export interface MockApi {
    container: StartedTestContainer;
    url: string;
}

/**
 * Prism validates every request against the upstream OpenAPI document and
 * answers with spec-conformant example data.
 */
export async function startMockApi(spec: UpstreamSpec): Promise<MockApi> {
    const container = await new GenericContainer(PRISM_IMAGE)
        .withCopyFilesToContainer([
            {
                source: path.resolve("openapi/upstream", `${spec}.json`),
                target: "/spec.json",
            },
        ])
        .withCommand(["mock", "-h", "0.0.0.0", "-p", "4010", "/spec.json"])
        .withExposedPorts(4010)
        .withWaitStrategy(Wait.forLogMessage(/Prism is listening/))
        .start();

    return {
        container,
        url: `http://${container.getHost()}:${container.getMappedPort(4010)}`,
    };
}
