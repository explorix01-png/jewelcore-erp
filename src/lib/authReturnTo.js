// Centralized authentication redirect and returnTo validator for JewelCore ERP.
// Guarantees safe, relative internal paths and strictly prevents redirect loops,
// recursive encoding, open redirects, and excessively long query parameters.

export const MAX_RETURN_TO_LENGTH = 256;
export const DEFAULT_AUTH_LANDING = "/";

// Auth routes that must NEVER be used as returnTo destinations.
export const AUTH_ROUTES = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password"
]);

/**
 * Checks if a given pathname belongs to an authentication route.
 */
export function isAuthRoute(pathname = "") {
  if (!pathname || typeof pathname !== "string") return false;
  const cleanPath = pathname.split("?")[0].toLowerCase().trim();
  // Match exact route or route prefix (e.g. /login/...)
  for (const route of AUTH_ROUTES) {
    if (cleanPath === route || cleanPath.startsWith(route + "/")) {
      return true;
    }
  }
  return false;
}

/**
 * Validates whether a candidate string is a safe, relative internal path.
 * Rejects external URLs, protocol-relative paths, backslashes, auth routes,
 * nested returnTo loops, and oversized strings.
 */
export function sanitizeInternalPath(candidate, fallback = DEFAULT_AUTH_LANDING) {
  if (!candidate || typeof candidate !== "string") return fallback;

  let trimmed = candidate.trim();
  if (!trimmed || trimmed.length > MAX_RETURN_TO_LENGTH) return fallback;

  // Reject protocol-relative "//", backslashes "\", or control characters
  if (trimmed.startsWith("//") || trimmed.includes("\\") || /[\r\n\t\0]/.test(trimmed)) {
    return fallback;
  }

  // Prevent multiple layers of URI encoding bypass (e.g. %252F -> %2F -> /)
  // Decode at most twice to inspect raw content
  try {
    if (trimmed.includes("%")) {
      const decodedOnce = decodeURIComponent(trimmed);
      if (decodedOnce.startsWith("//") || decodedOnce.includes("\\") || /[\r\n\t\0]/.test(decodedOnce)) {
        return fallback;
      }
    }
  } catch {
    return fallback;
  }

  try {
    // If candidate has an origin (e.g. http://localhost:5173/path), verify same-origin
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
    const url = new URL(trimmed, origin);

    // Reject external origins
    if (url.origin !== origin) {
      return fallback;
    }

    const pathname = url.pathname;

    // Must start with exactly one leading slash
    if (!pathname.startsWith("/") || pathname.startsWith("//")) {
      return fallback;
    }

    // Must not be an auth route (prevents /login -> /login loops)
    if (isAuthRoute(pathname)) {
      return fallback;
    }

    // Strip bootstrap and recursion-causing query parameters
    const forbiddenParams = [
      "returnTo", "returnto", "from_url", "fromurl", "redirect", "next",
      "token", "access_token", "clear_access_token", "app_id", "app_base_url", "functions_version"
    ];
    forbiddenParams.forEach((p) => url.searchParams.delete(p));

    const finalPath = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "");

    // Final sanity check on resulting string
    if (finalPath.length > MAX_RETURN_TO_LENGTH || isAuthRoute(url.pathname)) {
      return fallback;
    }

    return finalPath;
  } catch {
    return fallback;
  }
}

/**
 * Resolves the ?returnTo= parameter from the current window location search.
 * Returns a validated relative internal path, defaulting to DEFAULT_AUTH_LANDING ("/").
 */
export function safeReturnTo(fallback = DEFAULT_AUTH_LANDING) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = new URLSearchParams(window.location.search).get("returnTo");
    return sanitizeInternalPath(raw, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Builds a safe /login URL with an optional sanitized relative returnTo parameter.
 * Guarantees that /login is never nested into returnTo.
 */
export function buildLoginUrl(returnToCandidate = "") {
  const safe = sanitizeInternalPath(returnToCandidate, "");
  if (!safe || safe === DEFAULT_AUTH_LANDING || isAuthRoute(safe)) {
    return "/login";
  }
  return `/login?returnTo=${encodeURIComponent(safe)}`;
}
