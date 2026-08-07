"use client";

import { useCallback, useReducer } from "react";
import type { AxiosError } from "axios";
import type { ApiErrorResponse, ApiSuccessResponse, InstagramPost } from "@reelsavehub/types";
import { apiClient } from "@/lib/apiClient";
import { cleanInstagramUrl, isValidInstagramUrl } from "@/lib/validators";
import { cleanSessionCookie, isPlausibleSessionCookie } from "@/lib/privateContentValidators";

// A parallel, separate state machine from useInstagramDownloader.ts, not a
// shared one - the terminal states genuinely differ (SESSION_EXPIRED,
// ACCESS_DENIED have no equivalent in the public flow) and this flow's
// request shape (cookie + url) differs too. Reuses the same URL validator
// the public flow uses (isValidInstagramUrl/cleanInstagramUrl) rather than
// redefining it.
export type PrivateFetchStatus =
  | "IDLE"
  | "VALIDATING"
  | "FETCHING"
  | "SUCCESS"
  | "ERROR"
  | "RATE_LIMITED"
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED";

interface PrivateFetchState {
  status: PrivateFetchStatus;
  post: InstagramPost | null;
  errorMessage: string | null;
  errorCode: string | null;
}

type PrivateFetchAction =
  | { type: "VALIDATING" }
  | { type: "FETCHING" }
  | { type: "SUCCESS"; post: InstagramPost }
  | { type: "ERROR"; message: string; code: string | null }
  | { type: "RATE_LIMITED"; message: string }
  | { type: "SESSION_EXPIRED"; message: string }
  | { type: "ACCESS_DENIED"; message: string }
  | { type: "RESET" };

const initialState: PrivateFetchState = {
  status: "IDLE",
  post: null,
  errorMessage: null,
  errorCode: null,
};

function reducer(state: PrivateFetchState, action: PrivateFetchAction): PrivateFetchState {
  switch (action.type) {
    case "VALIDATING":
      return { ...initialState, status: "VALIDATING" };
    case "FETCHING":
      return { status: "FETCHING", post: null, errorMessage: null, errorCode: null };
    case "SUCCESS":
      return { status: "SUCCESS", post: action.post, errorMessage: null, errorCode: null };
    case "ERROR":
      return { status: "ERROR", post: null, errorMessage: action.message, errorCode: action.code };
    case "RATE_LIMITED":
      return {
        status: "RATE_LIMITED",
        post: null,
        errorMessage: action.message,
        errorCode: "RATE_LIMITED",
      };
    case "SESSION_EXPIRED":
      return {
        status: "SESSION_EXPIRED",
        post: null,
        errorMessage: action.message,
        errorCode: "SESSION_EXPIRED",
      };
    case "ACCESS_DENIED":
      return {
        status: "ACCESS_DENIED",
        post: null,
        errorMessage: action.message,
        errorCode: "ACCESS_DENIED",
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export function usePrivateContentFetch() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const submit = useCallback(async (rawSessionCookie: string, rawUrl: string) => {
    dispatch({ type: "VALIDATING" });

    const sessionCookie = cleanSessionCookie(rawSessionCookie);
    const url = cleanInstagramUrl(rawUrl);

    if (!isPlausibleSessionCookie(sessionCookie)) {
      dispatch({
        type: "ERROR",
        message: "That doesn't look like a full session cookie value. Double-check you copied the whole thing.",
        code: "INVALID_URL",
      });
      return;
    }

    if (!isValidInstagramUrl(url)) {
      dispatch({
        type: "ERROR",
        message: "Please paste a link to one of your own Reels or posts.",
        code: "INVALID_URL",
      });
      return;
    }

    dispatch({ type: "FETCHING" });

    try {
      const response = await apiClient.post<ApiSuccessResponse<InstagramPost>>("/private/fetch", {
        sessionCookie,
        url,
      });
      dispatch({ type: "SUCCESS", post: response.data.data });
    } catch (error) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const responseData = axiosError.response?.data;

      if (axiosError.response?.status === 429) {
        dispatch({
          type: "RATE_LIMITED",
          message: responseData?.message ?? "Too many requests. Please try again later.",
        });
        return;
      }

      if (responseData?.code === "SESSION_EXPIRED") {
        dispatch({
          type: "SESSION_EXPIRED",
          message: responseData.message,
        });
        return;
      }

      if (responseData?.code === "ACCESS_DENIED") {
        dispatch({
          type: "ACCESS_DENIED",
          message: responseData.message,
        });
        return;
      }

      dispatch({
        type: "ERROR",
        message: responseData?.message ?? "Something went wrong. Please try again.",
        code: responseData?.code ?? null,
      });
    }
  }, []);

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return { ...state, submit, reset };
}
