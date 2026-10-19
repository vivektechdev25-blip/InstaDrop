import { parseRegionProxy, type RegionProxy } from "../../config/env";

let cached: RegionProxy | null | undefined;

/**
 * The proxy configured in INSTAGRAM_REGION_PROXY_URL, or null. Read once;
 * server.ts has already validated it at startup (loadServerConfig), so a
 * malformed value never gets this far in a running server.
 */
export function getRegionProxy(): RegionProxy | null {
  if (cached === undefined) cached = parseRegionProxy(process.env.INSTAGRAM_REGION_PROXY_URL);
  return cached;
}

/** Tests only: forget the cached value so the next call re-reads the env. */
export function resetRegionProxyForTests(): void {
  cached = undefined;
}
