export interface SessionUser {
  userId: string;
  username: string;
  name?: string | null;
  role: "ADMIN" | "OPERATOR";
}

const AUTH_SECRET = process.env.AUTH_SECRET || "watervend-super-secret-key-2026";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const encoder = new TextEncoder();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str: string): Uint8Array {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload = JSON.stringify({
    ...user,
    exp: Date.now() + SESSION_DURATION_MS,
  });
  const encodedPayload = bytesToBase64Url(encoder.encode(payload));
  const key = await getHmacKey(AUTH_SECRET);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(encodedPayload)
  );
  const signature = bytesToBase64Url(new Uint8Array(signatureBuffer));
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) return null;

    const key = await getHmacKey(AUTH_SECRET);
    const signatureBytes = base64UrlToBytes(signature);
    const dataBytes = encoder.encode(encodedPayload);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as BufferSource,
      dataBytes
    );
    if (!isValid) return null;

    const payloadBytes = base64UrlToBytes(encodedPayload);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadStr);

    if (Date.now() > payload.exp) return null;

    return {
      userId: payload.userId,
      username: payload.username,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
