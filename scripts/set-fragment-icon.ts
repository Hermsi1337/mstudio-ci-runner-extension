/**
 * Sets icon and title of the frontend fragments in mStudio. Both live in
 * `additionalProperties` of the fragment and the extension form in mStudio does
 * not offer them, so they can only be set through the API.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MittwaldAPIV2Client } from "@mittwald/api-client";

// The anchor documentation states that only "de" is supported as a title
// language right now.
const TITLES = { de: "CI Runner" };

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not set`);
    }

    return value;
}

const apiToken = required("MITTWALD_API_TOKEN");
const contributorId = required("MITTWALD_CONTRIBUTOR_ID");
const extensionId = required("MITTWALD_EXTENSION_ID");

const client = MittwaldAPIV2Client.newWithToken(apiToken);
if (process.env.MITTWALD_API_URL) {
    client.axios.defaults.baseURL = process.env.MITTWALD_API_URL;
}

const icon = (
    await readFile(path.resolve("src/assets/fragment-icon.svg"), "utf8")
).trim();

const extension = await client.marketplace.extensionGetOwnExtension({
    contributorId,
    extensionId,
});
if (extension.status !== 200) {
    throw new Error(`reading the extension failed: ${extension.status}`);
}

const fragments = extension.data.frontendFragments ?? {};
const anchors = Object.keys(fragments);
if (anchors.length === 0) {
    throw new Error("the extension has no frontend fragment");
}

const patched = Object.fromEntries(
    anchors.map((anchor) => [
        anchor,
        {
            url: fragments[anchor].url,
            additionalProperties: {
                ...fragments[anchor].additionalProperties,
                anchor,
                icon,
                title: JSON.stringify(TITLES),
            },
        },
    ]),
);

const result = await client.marketplace.extensionPatchExtension({
    contributorId,
    extensionId,
    data: { frontendFragments: patched },
});
if (result.status !== 200) {
    throw new Error(`patching the extension failed: ${result.status}`);
}

console.log(`icon and title set for: ${anchors.join(", ")}`);
