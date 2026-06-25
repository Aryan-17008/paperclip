const BASE = "/api";

export class ApiError extends Error {
  status: number;
  body: unknown;
  retryAfter?: number;

  constructor(message: string, status: number, body: unknown, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

/**
 * Rate limit state: tracks per-endpoint backoff.
 */
const rateLimitState = new Map<string, { retryAfter: number; attempts: number }>();

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

function getRetryAfterMs(res: Response): number | undefined {
  const header = res.headers.get("Retry-After");
  if (header) {
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }
  const resetHeader = res.headers.get("X-RateLimit-Reset");
  if (resetHeader) {
    const resetTime = parseInt(resetHeader, 10) * 1000;
    const now = Date.now();
    if (resetTime > now) return resetTime - now;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  const body = init?.body;
  if (!(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE}${path}`, {
    headers,
    credentials: "include",
    ...init,
  });

  // Handle rate limit (429)
  if (res.status === 429) {
    const retryAfter = getRetryAfterMs(res);
    const state = rateLimitState.get(path) ?? { retryAfter: 0, attempts: 0 };
    state.attempts++;
    const backoffMs = retryAfter ?? Math.min(BASE_BACKOFF_MS * Math.pow(2, state.attempts - 1), 30000);
    state.retryAfter = Date.now() + backoffMs;
    rateLimitState.set(path, state);

    if (attempt < MAX_RETRIES) {
      console.warn(`[RateLimit] ${path} attempt=${attempt + 1}/${MAX_RETRIES} backoff=${backoffMs}ms`);
      await sleep(backoffMs);
      return request<T>(path, init, attempt + 1);
    }

    const errorBody = await res.json().catch(() => null);
    throw new ApiError(
      (errorBody as { error?: string } | null)?.error ?? `Rate limited: ${res.status}`,
      res.status,
      errorBody,
      retryAfter,
    );
  }

  // Clear rate limit state on success
  if (res.ok) {
    rateLimitState.delete(path);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new ApiError(
      (errorBody as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
      res.status,
      errorBody,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData) =>
    request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
