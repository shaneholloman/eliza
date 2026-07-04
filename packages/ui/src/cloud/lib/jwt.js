/**
 * Single source of truth for decoding a Steward JWT payload in the browser.
 *
 * The cloud surfaces only ever inspect the *unverified* payload (its `exp` plus
 * a few identity claims) to decide whether a locally stored session still looks
 * live before the server confirms it. Signature verification is the server's
 * job. Every cloud domain delegates here so the null/expired semantics stay
 * identical across surfaces.
 */
/**
 * Base64url-decode and JSON-parse the payload (second segment) of a JWT.
 * Returns `null` for any malformed token (wrong segment count, bad base64,
 * invalid JSON) so callers treat "can't read it" as "no session".
 */
export function decodeJwtPayload(token) {
    try {
        const parts = token.split(".");
        if (parts.length !== 3)
            return null;
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
        return JSON.parse(atob(padded));
    }
    catch {
        return null;
    }
}
/** Milliseconds-since-epoch the token expires, or `null` when it has no `exp`. */
export function jwtExpiryMs(token) {
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.exp !== "number")
        return null;
    return payload.exp * 1000;
}
