"use client";

import { useCallback, useReducer } from "react";
import type { AxiosError } from "axios";
import type { ApiErrorResponse, ApiSuccessResponse, InstagramPost } from "@reelsavehub/types";
import { apiClient } from "@/lib/apiClient";
import { cleanInstagramUrl, isValidInstagramUrl } from "@/lib/validators";

export type DownloaderStatus =
  | "IDLE"
  | "VALIDATING"
  | "FETCHING"
  | "SUCCESS"
  | "ERROR"
  | "RATE_LIMITED";

interface DownloaderState {
  status: DownloaderStatus;
  post: InstagramPost | null;
  errorMessage: string | null;
  errorCode: string | null;
}

type DownloaderAction =
  | { type: "VALIDATING" }
  | { type: "FETCHING" }
  | { type: "SUCCESS"; post: InstagramPost }
  | { type: "ERROR"; message: string; code: string | null }
  | { type: "RATE_LIMITED"; message: string }
  | { type: "RESET" };

const initialState: DownloaderState = {
  status: "IDLE",
  post: null,
  errorMessage: null,
  errorCode: null,
};

function reducer(state: DownloaderState, action: DownloaderAction): DownloaderState {
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
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export function useInstagramDownloader() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const submit = useCallback(async (rawUrl: string) => {
    dispatch({ type: "VALIDATING" });

    const cleanedUrl = cleanInstagramUrl(rawUrl);

    if (!isValidInstagramUrl(cleanedUrl)) {
      dispatch({
        type: "ERROR",
        message: "Please paste a valid public Instagram post, reel, or IGTV link.",
        code: "INVALID_URL",
      });
      return;
    }

    dispatch({ type: "FETCHING" });

    try {
      const response = await apiClient.post<ApiSuccessResponse<InstagramPost>>("/fetch", {
        url: cleanedUrl,
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
