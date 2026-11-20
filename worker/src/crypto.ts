const encoder = new TextEncoder();

export function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

export function randomToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return prefix + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function hmacHex(key: CryptoKey, text: string): Promise<string> {
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
}
