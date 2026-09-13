import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";

export const localModulePrefix = "local:";

const remoteComponents = "@mittwald/flow-remote-react-components";
const hostComponents = "@mittwald/flow-react-components";
const sharedUiImport =
    /from "(@\/(?:components|hooks)\/[^"]+|\.{1,2}\/[^"]+\.tsx)"/g;

export function rewriteForLocalHost(code: string): string {
    return code
        .replaceAll(`"${remoteComponents}`, `"${hostComponents}`)
        .replace(sharedUiImport, `from "${localModulePrefix}$1"`);
}

/**
 * The UI is written against the remote Flow components, which only render inside
 * mStudio. Modules imported with the `local:` prefix are served as a second copy in
 * which those imports point to the DOM-rendering Flow components, and their imports
 * of other UI modules carry the prefix as well. The /local route uses this copy to
 * show the same UI without an mStudio host.
 */
export function localHostComponents(): Plugin {
    return {
        name: "local-host-components",
        enforce: "pre",
        async resolveId(source, importer) {
            if (!source.startsWith(localModulePrefix)) {
                return null;
            }
            const resolved = await this.resolve(
                source.slice(localModulePrefix.length),
                importer?.replace(localModulePrefix, ""),
                { skipSelf: true },
            );
            return resolved ? localModulePrefix + resolved.id : null;
        },
        async load(id) {
            if (!id.startsWith(localModulePrefix)) {
                return null;
            }
            const file = id.slice(localModulePrefix.length);
            return rewriteForLocalHost(await readFile(file, "utf8"));
        },
    };
}
