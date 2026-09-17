/**
 * The "open path" of an app: where its tile should land, e.g. `/ui` or
 * `/admin/login`, for apps whose web UI is not served at `/`.
 *
 * It only shapes the link the desktop opens. It never changes proxy routing,
 * so every other path on the app keeps working. Because it is concatenated
 * onto the app's origin, it must not be able to point anywhere else.
 */

export const MAX_OPEN_PATH_LENGTH = 256;

/** A single leading slash, then no whitespace or backslashes. */
const OPEN_PATH_PATTERN = /^\/(?!\/)[^\s\\]*$/;
const FIRST_PRINTABLE_CHAR_CODE = 0x20;
const DELETE_CHAR_CODE = 0x7f;

function hasControlCharacter(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < FIRST_PRINTABLE_CHAR_CODE || code === DELETE_CHAR_CODE;
  });
}

/**
 * Validate and normalise a user-supplied open path.
 *
 * @returns the path with a leading slash, or undefined for empty or `/`
 * @throws Error when the value could resolve outside the app's own origin
 */
export function normalizeOpenPath(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "/") return undefined;

  // Schemes and protocol-relative forms are checked on the raw value, before
  // a leading slash is added, so "http://x" cannot hide as "/http://x".
  const invalid =
    trimmed.length > MAX_OPEN_PATH_LENGTH ||
    trimmed.includes("://") ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (invalid || hasControlCharacter(candidate) || !OPEN_PATH_PATTERN.test(candidate)) {
    throw new Error(
      'Open path must be a path on the app itself, like "/ui" or "/admin/login"',
    );
  }
  return candidate;
}

/** Open path from a store manifest: same rules, but invalid values are ignored. */
export function manifestOpenPath(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return normalizeOpenPath(raw);
  } catch {
    return undefined;
  }
}
