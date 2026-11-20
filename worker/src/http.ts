export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const BASE_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function errorResponse(error: HttpError, headers: Record<string, string> = {}): Response {
  return json({ error: error.code, message: error.message }, error.status, headers);
}

/** Parses a JSON body of at most `maxBytes`, rejecting anything else with a 4xx. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Send application/json.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new HttpError(413, "payload_too_large");
  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) throw new HttpError(413, "payload_too_large");
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}
