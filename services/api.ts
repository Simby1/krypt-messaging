const BASE = "https://whisperbox.koyeb.app";

export function getAccessToken(): string | null {
  return localStorage.getItem("wb_access_token");
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem("wb_refresh_token");
  if (!refreshToken) return null;
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  localStorage.setItem("wb_access_token", data.access_token);
  localStorage.setItem("wb_token_expires_at", String(Date.now() + data.expires_in * 1000));
  return data.access_token;
}

export async function getValidToken(): Promise<string | null> {
  const expiresAt = Number(localStorage.getItem("wb_token_expires_at") || 0);
  if (Date.now() > expiresAt - 60_000) return refreshAccessToken();
  return getAccessToken();
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidToken();
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function logout(): Promise<void> {
  try {
    const headers = await authHeaders();
    await fetch(`${BASE}/auth/logout`, { method: "POST", headers });
  } catch { /* ignore */ } finally { localStorage.clear(); }
}

export async function searchUsers(query: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/users/search?q=${encodeURIComponent(query)}`, { headers });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function getUserPublicKey(userId: string): Promise<string> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/users/${userId}/public-key`, { headers });
  if (!res.ok) throw new Error("Failed to fetch public key");
  const data = await res.json();
  const key = data.public_key;
  // If server auto-deserialised the stored JSON blob, re-stringify it
  if (typeof key === "object" && key !== null) return JSON.stringify(key);
  return key as string;
}

export async function getConversations() {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/conversations`, { headers });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json();
}

export async function getMessages(userId: string, before?: string) {
  const headers = await authHeaders();
  const url = before
    ? `${BASE}/conversations/${userId}/messages?before=${before}`
    : `${BASE}/conversations/${userId}/messages`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  encryptedKey: string;
  encryptedKeyForSelf: string;
}

/**
 * Send an encrypted message via REST.
 *
 * Tries two payload shapes because different server configs expect different things:
 *   Shape A — payload as nested object (per OpenAPI spec)
 *   Shape B — payload as JSON string (server treats it as an opaque blob)
 */
export async function sendMessageRest(toUserId: string, payload: EncryptedPayload): Promise<any> {
  const headers = await authHeaders();

  // Shape A: { to, payload: { ciphertext, iv, ... } }
  const resA = await fetch(`${BASE}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ to: toUserId, payload }),
  });

  if (resA.ok) {
    console.log("[REST] shape A accepted");
    return resA.json();
  }

  const statusA = resA.status;
  console.warn(`[REST] shape A rejected (${statusA}), trying shape B`);

  // Shape B: { to, payload: "<json string>" }
  const resB = await fetch(`${BASE}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ to: toUserId, payload: JSON.stringify(payload) }),
  });

  if (resB.ok) {
    console.log("[REST] shape B accepted");
    return resB.json();
  }

  const err = await resB.json().catch(() => ({ detail: `HTTP ${resB.status}` }));
  throw new Error(err.detail || "Failed to send message");
}