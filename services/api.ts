const BASE = "https://whisperbox.koyeb.app";

// ─── Token Management ────────────────────────────────────────────────────────

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
  const expiresAt = Date.now() + data.expires_in * 1000;
  localStorage.setItem("wb_token_expires_at", String(expiresAt));
  return data.access_token;
}

/** Always returns a valid token, refreshing if needed. */
export async function getValidToken(): Promise<string | null> {
  const expiresAt = Number(localStorage.getItem("wb_token_expires_at") || 0);
  // Refresh if within 60 seconds of expiry
  if (Date.now() > expiresAt - 60_000) {
    return refreshAccessToken();
  }
  return getAccessToken();
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  try {
    const headers = await authHeaders();
    await fetch(`${BASE}/auth/logout`, { method: "POST", headers });
  } catch {
    // ignore logout errors
  } finally {
    localStorage.clear();
  }
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function searchUsers(query: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/users/search?q=${encodeURIComponent(query)}`, { headers });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

/**
 * Returns the public key for a user.
 * Always returns a string — either a JSON-stringified JWK or a PEM/base64 DER.
 * The crypto layer handles all formats via importPublicKey().
 */
export async function getUserPublicKey(userId: string): Promise<string> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/users/${userId}/public-key`, { headers });
  if (!res.ok) throw new Error("Failed to fetch public key");
  const data = await res.json();

  const key = data.public_key;

  // If the server returned an object (already parsed JWK), re-stringify it
  // so the crypto layer can handle it uniformly
  if (typeof key === "object" && key !== null) {
    return JSON.stringify(key);
  }

  // It's already a string (JWK string, PEM, or base64 DER) — return as-is
  return key as string;
}

// ─── Conversations ────────────────────────────────────────────────────────────

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

// ─── Messages (REST fallback) ─────────────────────────────────────────────────

export async function sendMessageRest(toUserId: string, payload: {
  ciphertext: string;
  iv: string;
  encryptedKey: string;
  encryptedKeyForSelf: string;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ to: toUserId, payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to send message" }));
    throw new Error(err.detail || "Failed to send message");
  }
  return res.json();
}