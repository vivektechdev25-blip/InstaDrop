import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@reelsavenow/types";

export interface RequestFailure {
  /** HTTP status, or null when no response arrived at all. */
  status: number | null;
  code: string | null;
  message: string;
}

const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const RATE_LIMITED_MESSAGE = "Too many requests. Please try again later.";
const TIMEOUT_MESSAGE =
  "This is taking longer than usual. Please try again in a moment.";
const NETWORK_MESSAGE =
  "We couldn't reach the ReelSaveNow servers. Check your connection and try again.";

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
    return {
      status: response.status,
      code: envelope?.code ?? null,
      message:
        envelope?.message ?? (response.status === 429 ? RATE_LIMITED_MESSAGE : GENERIC_MESSAGE),
    };
  }

  if (axiosError?.code === "ECONNABORTED" || axiosError?.code === "ETIMEDOUT") {
    return { status: null, code: null, message: TIMEOUT_MESSAGE };
  }

  if (axiosError?.code === "ERR_NETWORK") {
    return { status: null, code: null, message: NETWORK_MESSAGE };
  }

  return { status: null, code: null, message: GENERIC_MESSAGE };
}
