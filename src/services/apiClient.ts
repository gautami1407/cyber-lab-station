export const API_BASE_URL: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "/api";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 0, code = "ERROR") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong while completing this operation. Please try again.";
}

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

let csrfToken = "";

/** Safely parse JSON from a Response. Returns null for empty/non-JSON bodies. */
async function safeJson<T>(response: Response): Promise<Envelope<T> | null> {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as Envelope<T>;
  } catch {
    return null;
  }
}

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/csrf`, { credentials: "include" });
  } catch {
    throw new ApiError(
      "Backend API is unavailable. Make sure the NetLink server is running on port 4000.",
      0,
      "BACKEND_UNAVAILABLE",
    );
  }

  const payload = await safeJson<{ csrfToken: string }>(response);
  if (!payload || payload.success === false) {
    throw new ApiError("Could not start a secure session with the API.", response.status, "CSRF");
  }
  csrfToken = payload.data.csrfToken;
  return csrfToken;
}

export async function request<TResponse, TBody = unknown>(
  path: string,
  options: { method?: string; body?: TBody; signal?: AbortSignal } = {},
): Promise<TResponse> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (method !== "GET" && method !== "HEAD") {
    headers["X-CSRF-Token"] = await ensureCsrf();
  }

  const init: RequestInit = {
    method,
    headers,
    credentials: "include",
  };
  if (options.body) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new ApiError(
      "Backend API is unavailable. Make sure the NetLink server is running on port 4000.",
      0,
      "BACKEND_UNAVAILABLE",
    );
  }

  let payload: Envelope<TResponse> | null = await safeJson<TResponse>(response);

  if (
    response.status === 403 &&
    payload &&
    payload.success === false &&
    payload.error.code === "CSRF_REJECTED"
  ) {
    csrfToken = "";
    if (method !== "GET") {
      headers["X-CSRF-Token"] = await ensureCsrf();
      const retryInit: RequestInit = { method, headers, credentials: "include" };
      if (options.body) retryInit.body = JSON.stringify(options.body);
      if (options.signal) retryInit.signal = options.signal;
      let retry: Response;
      try {
        retry = await fetch(`${API_BASE_URL}${path}`, retryInit);
      } catch {
        throw new ApiError(
          "Backend API is unavailable. Make sure the NetLink server is running on port 4000.",
          0,
          "BACKEND_UNAVAILABLE",
        );
      }
      payload = await safeJson<TResponse>(retry);
      if (retry.ok && payload && payload.success !== false) return payload.data;
    }
  }

  if (!response.ok || !payload || payload.success === false) {
    const message =
      payload && payload.success === false
        ? payload.error.message
        : "The request could not be completed. Please check your input and try again.";
    const code = payload && payload.success === false ? payload.error.code : "ERROR";
    throw new ApiError(message, response.status, code);
  }

  return payload.data;
}
