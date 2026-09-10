/**
 * Thin API abstraction.
 *
 * The toolkit currently runs in DEMO MODE and resolves every call from local
 * mock data. When the backend exists, flip `DEMO_MODE` to false (or set
 * VITE_API_BASE_URL) and each service will issue real REST calls instead —
 * no UI changes required.
 */

export const API_BASE_URL: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "/api";

export const DEMO_MODE = true;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** User-friendly message for any failure. Never surfaces internals. */
export function toUserMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong while completing this operation. Please try again.";
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Real transport, used once the backend is connected. */
export async function request<TResponse, TBody = unknown>(
  path: string,
  options: { method?: string; body?: TBody; signal?: AbortSignal } = {},
): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    throw new ApiError(
      "The request could not be completed. Please check your input and try again.",
      response.status,
    );
  }

  return (await response.json()) as TResponse;
}
