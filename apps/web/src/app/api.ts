import type { ApiResponse } from "./types";

export async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const raw = await response.text();
  if (!raw) return { ok: false, error: "No response body from API" };
  try {
    return JSON.parse(raw) as ApiResponse<T>;
  } catch {
    return { ok: false, error: raw };
  }
}
