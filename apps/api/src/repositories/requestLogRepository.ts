import { createClient } from "@supabase/supabase-js";
import type { NewRequestLog } from "../models/RequestLog";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

async function insert(requestLog: NewRequestLog): Promise<void> {
  const { error } = await supabase.from("request_logs").insert(requestLog);

  if (error) {
    throw error;
  }
}

export const requestLogRepository = { insert };
