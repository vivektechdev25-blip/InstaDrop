export interface RequestLog {
  id: string;
  hashed_ip: string;
  endpoint: string;
  status_code: number;
  created_at: string;
}

export type NewRequestLog = Omit<RequestLog, "id" | "created_at">;
