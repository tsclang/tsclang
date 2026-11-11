// Shared fetch helper for every CLI network call (catalog, .tspkg archives,
// toolchain bundles, doctor version checks).
//
// Two contracts that plain `fetch(url, { signal: AbortSignal.timeout(...) })`
// breaks on the error path:
//
// 1. `AbortSignal.timeout()` owns its timer and cannot be cleared — we keep
//    ownership instead and clear it as soon as the fetch settles.
// 2. Throwing on an HTTP-error response without consuming the body leaves the
//    undici socket half-open; tearing that down inside `process.exit()` trips
//    the win32 libuv assertion `!(handle->flags & UV_HANDLE_CLOSING)` and the
//    process dies with 0xC0000409 instead of the intended exit code.

/** fetch with an owned, always-cleared timeout timer; HTTP-error responses
 * are returned with their body cancelled so the connection is released. */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) await res.body?.cancel().catch(() => {});
    return res;
  } finally {
    clearTimeout(timer);
  }
}
