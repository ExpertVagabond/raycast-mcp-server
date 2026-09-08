/**
 * Vendored subset of @purplesquirrel/mcp-core-ts (formerly @psm/mcp-core-ts).
 *
 * WHY THIS FILE EXISTS
 *   This package depended on the upstream via `"@psm/mcp-core-ts":
 *   "file:../psm-mcp-core-ts"`. A relative path dependency only resolves on a
 *   machine that happens to have the sibling checkout, so:
 *     - Dependabot aborted every security update job with "The following path
 *       based dependencies could not be retrieved: @psm/mcp-core-ts", which is
 *       why npm advisories here went unpatched for months.
 *     - `npm install raycast-mcp-server` by a consumer cannot resolve it.
 *   The upstream was renamed to @purplesquirrel/mcp-core-ts to be published,
 *   but it is not on the registry yet, so there is nothing to depend on.
 *
 * KEEPING IN SYNC
 *   Copied byte-for-byte from psm-mcp-core-ts src/error.ts at commit d75b2f9,
 *   which itself mirrors psm-mcp-core/src/error.rs 1:1. If the upstream path
 *   regex or truncation behaviour changes, re-copy it here and update that sha.
 *   Once @purplesquirrel/mcp-core-ts is published, delete this file and depend
 *   on the registry version instead.
 *
 * SCOPE
 *   Only the surface used by this package is vendored:
 *     - sanitizeError (error.ts) — used by src/index.ts and src/handlers.ts
 */

// Mirrors: sanitize_error() in error.rs
const PATH_RE = /(?:\/[a-zA-Z0-9._\-]+){3,}/g;

/**
 * Strip file paths, truncate to maxLen chars, redact tokens longer than 40 chars.
 */
export function sanitizeError(msg: string, maxLen = 300): string {
  const stripped = msg.replace(PATH_RE, "[PATH]");
  const words = stripped.split(/\s+/);
  let out = "";
  for (const word of words) {
    const part = word.length > 40 ? "[REDACTED]" : word;
    if (out.length + part.length + 1 >= maxLen) {
      return out.slice(0, maxLen) + "...";
    }
    out += (out ? " " : "") + part;
  }
  return out;
}
