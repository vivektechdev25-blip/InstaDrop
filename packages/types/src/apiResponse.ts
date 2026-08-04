export interface ApiSuccessResponse<TData> {
  success: true;
  message: string;
  data: TData;
  errors: null;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  data: null;
  errors: Record<string, string[]> | null;
}

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;
