import { MittwaldAPIV2Client } from "@mittwald/api-client";
import { getEnvironmentVariables } from "@/env.ts";

export function createMittwaldClient(
    accessToken?: string,
): MittwaldAPIV2Client {
    const client = accessToken
        ? MittwaldAPIV2Client.newWithToken(accessToken)
        : MittwaldAPIV2Client.newUnauthenticated();
    client.axios.defaults.baseURL = getEnvironmentVariables().MITTWALD_API_URL;
    return client;
}
