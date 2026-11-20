export const API_ORIGIN = "https://herdr-rank-api.kohanacloud.com";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** One JSON request to the Token Rank API. Rejects with ApiError on any non-2xx answer. */
export async function request(method, path, { token, body } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(API_ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? "http_error", data.message ?? `HTTP ${response.status}`);
  return data;
}
