/**
 * Writes the marketplace entry and the frontend fragments of the extension
 * from deploy/mstudio/extension.yaml into mStudio. Texts, logo, fragment icon
 * and fragment title live in the repository, not in the extension form.
 * Scopes and webhook URLs are deliberately left alone: new scopes make every
 * installation consent again, and the webhook URL belongs to the deployment.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MittwaldAPIV2Client } from "@mittwald/api-client";
import { parse as parseYaml } from "yaml";

interface Localized {
    de: string;
    en: string;
}

interface ExtensionConfig {
    name: string;
    tags: string[];
    support: { email: string; phone?: string };
    subTitle: Localized;
    description: Localized;
    detailedDescriptions: Localized;
    fragment: { icon: string; title: { de: string } };
    logo: string;
}

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

const configFile = path.resolve("deploy/mstudio/extension.yaml");
const config = parseYaml(await readFile(configFile, "utf8")) as ExtensionConfig;
const icon = (
    await readFile(path.resolve(config.fragment.icon), "utf8")
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
                title: JSON.stringify(config.fragment.title),
            },
        },
    ]),
);

const markdown = (text: string) => ({ markdown: text });

const result = await client.marketplace.extensionPatchExtension({
    contributorId,
    extensionId,
    data: {
        name: config.name,
        tags: config.tags,
        support: config.support,
        subTitle: config.subTitle,
        // The API knows one description without a language. mStudio is German
        // first, so the German text wins; the English one stays in the file for
        // the marketplace form.
        description: config.description.de,
        detailedDescriptions: {
            de: markdown(config.detailedDescriptions.de),
            en: markdown(config.detailedDescriptions.en),
        },
        frontendFragments: patched,
    },
});
if (result.status !== 200) {
    throw new Error(`patching the extension failed: ${result.status}`);
}
console.log(`texts and fragments written: ${anchors.join(", ")}`);

const upload = await client.marketplace.extensionRequestLogoUpload({
    contributorId,
    extensionId,
});
if (upload.status !== 200) {
    throw new Error(`requesting the logo upload failed: ${upload.status}`);
}

const logoFile = path.resolve(config.logo);
const form = new FormData();
form.append(
    "file",
    new Blob([await readFile(logoFile)], { type: "image/png" }),
    path.basename(logoFile),
);

const stored = await client.file.createFile({
    headers: { Token: upload.data.logoRefId },
    data: form as unknown as Record<string, unknown>,
});
if (stored.status !== 201) {
    throw new Error(`uploading the logo failed: ${stored.status}`);
}
console.log(`logo uploaded: ${path.relative(process.cwd(), logoFile)}`);
