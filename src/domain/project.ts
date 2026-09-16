import type { MittwaldAPIV2Client } from "@mittwald/api-client";
import type { ProjectCapabilities } from "@/generated/extension-api";
import { UpstreamError } from "@/global-errors.ts";
import { createLogger } from "@/logger.ts";

const log = createLogger("project");

const CONTAINER_FEATURE = "container";

/**
 * Runners are containers, so a project that does not support Container Hosting
 * cannot host them. mittwald reports the supported features on the project
 * itself; asking before the form is offered turns a failing stack create into
 * a hint the user sees right away.
 */
export async function getProjectCapabilities(
    client: MittwaldAPIV2Client,
    projectId: string,
): Promise<ProjectCapabilities> {
    const response = await client.project.getProject({ projectId });
    if (response.status !== 200) {
        throw new UpstreamError("error.upstream.projectGet", {
            status: response.status,
        });
    }
    const containerHosting =
        response.data.supportedFeatures.includes(CONTAINER_FEATURE);
    log.debug("project capabilities read", { projectId, containerHosting });

    return { containerHosting };
}
