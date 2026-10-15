import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@reelsavenow/types";

export interface RequestFailure {
  /** HTTP status, or null when no response arrived at all. */
  status: number | null;
  code: string | null;
  message: string;
  /** Seconds until a rate limit lifts, when the server said. */
  retryAfterSeconds: number | null;
}

const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const TIMEOUT_MESSAGE =
  "This is taking longer than usual. Please try again in a moment.";
const NETWORK_MESSAGE =
  "We couldn't reach the ReelSaveNow servers. Check your connection and try again.";
const BUSY_MESSAGE = "Our servers are busy right now. Please try again in a moment.";
const GATEWAY_MESSAGE = "The server took too long to respond. Please try again.";

/**
 * "Try again later" gives a user nothing to act on. The API sends
 * Retry-After with every 429 (readable cross-origin since the API started
 * exposing it), so the wait can be stated.
 */
export function describeRateLimit(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null || retryAfterSeconds <= 0) {
    return "Too many requests. Please try again later.";
  }
  if (retryAfterSeconds < 60) return "Too many requests. Please try again in a minute.";
  return `Too many requests. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`;
}

export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * The message for a response that carried no API envelope - the platform
 * in front of the API answering on its behalf (a proxy 502, an HTML 503
 * while the container restarts, a 504 from the edge). Those used to all
 * read "Something went wrong", which told the user nothing about whether
 * retrying would help.
 */
function describeBareStatus(status: number, retryAfterSeconds: number | null): string {
  if (status === 429) return describeRateLimit(retryAfterSeconds);
  if (status === 503) return BUSY_MESSAGE;
  if (status === 502 || status === 504) return GATEWAY_MESSAGE;
  return GENERIC_MESSAGE;
}

function failureFromResponse(
  status: number,
  envelope: Partial<ApiErrorResponse> | null,
  retryAfterHeader: string | null | undefined
): RequestFailure {
  const retryAfterSeconds = parseRetryAfter(retryAfterHeader);
  return {
    status,
    code: envelope?.code ?? null,
    message: envelope?.message ?? describeBareStatus(status, retryAfterSeconds),
    retryAfterSeconds,
  };
}

/**
 * One place that turns an axios failure into what the user is told.
 *
 * Without a response there's no API envelope to read, and both hooks used
 * to collapse every such case into GENERIC_MESSAGE - so a request that hit
 * apiClient's 30s timeout (a slow scrape on a cold browser) looked exactly
 * like a CORS failure or being offline, which is what made "works on my
 * network, fails on another" reports impossible to diagnose from the
 * symptom (see apiClient.ts). axios distinguishes them by `code`.
 */
export function describeRequestFailure(error: unknown): RequestFailure {
  const axiosError = error as AxiosError<ApiErrorResponse> | undefined;
  const response = axiosError?.response;

  if (response) {
    // A platform-level failure (proxy 502, crashed container) returns an
    // HTML page, not the API's envelope - don't read fields off a string.
    const envelope =
      typeof response.data === "object" && response.data !== null ? response.data : null;
    const headers = response.headers as Record<string, string | undefined> | undefined;
    return failureFromResponse(response.status, envelope, headers?.["retry-after"]);
  }

  if (axiosError?.code === "ECONNABORTED" || axiosError?.code === "ETIMEDOUT") {
    return { status: null, code: null, message: TIMEOUT_MESSAGE, retryAfterSeconds: null };
  }

  if (axiosError?.code === "ERR_NETWORK") {
    return { status: null, code: null, message: NETWORK_MESSAGE, retryAfterSeconds: null };
  }

  return { status: null, code: null, message: GENERIC_MESSAGE, retryAfterSeconds: null };
}

/** The same, for a fetch() Response - the download path does not use axios. */
export async function describeFetchFailure(response: Response): Promise<RequestFailure> {
  let envelope: Partial<ApiErrorResponse> | null = null;
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === "object" && parsed !== null) envelope = parsed as ApiErrorResponse;
  } catch {
    // Not every failure is the API's own envelope - see describeBareStatus.
  }
  return failureFromResponse(response.status, envelope, response.headers.get("retry-after"));
}
