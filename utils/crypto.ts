import { get, set, del } from "idb-keyval";

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  encryptedKey: string;
  encryptedKeyForSelf: string;
}

export interface KeyMaterial {
  publicKeyJwk: object;
  wrappedPrivateKey: string;
  pbkdf2Salt: string;
}

// ─── Private key: IndexedDB ───────────────────────────────────────────────────

const IDB_KEY = "krypt_private_key";

export async function storePrivateKey(key: CryptoKey): Promise<void> {
  await set(IDB_KEY, key);
}
export async function loadPrivateKey(): Promise<CryptoKey | undefined> {
  return get<CryptoKey>(IDB_KEY);
}
export async function clearPrivateKey(): Promise<void> {
  await del(IDB_KEY);
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function generateAndWrapKeys(password: string): Promise<KeyMaterial> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(16));
  const wrappingKey = await deriveWrappingKey(password, toAB(salt));

  const pkcs8Buffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const wrappedBuffer = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: toAB(wrapIv) },
    wrappingKey,
    pkcs8Buffer
  );

  const combined = new Uint8Array(wrapIv.byteLength + wrappedBuffer.byteLength);
  combined.set(wrapIv, 0);
  combined.set(new Uint8Array(wrappedBuffer), wrapIv.byteLength);

  await storePrivateKey(keyPair.privateKey);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  return {
    publicKeyJwk,
    wrappedPrivateKey: bufToBase64(combined),
    pbkdf2Salt: bufToBase64(salt),
  };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function unwrapAndStorePrivateKey(
  password: string,
  wrappedPrivateKeyB64: string,
  pbkdf2SaltB64: string
): Promise<void> {
  const salt = b64toAB(pbkdf2SaltB64);
  const wrappingKey = await deriveWrappingKey(password, salt);

  const combined = new Uint8Array(b64toAB(wrappedPrivateKeyB64));
  const wrapIv = toAB(combined.slice(0, 16));
  const wrappedKey = toAB(combined.slice(16));

  const pkcs8Buffer = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: wrapIv },
    wrappingKey,
    wrappedKey
  );

  const privateKey = await crypto.subtle.importKey(
    "pkcs8", pkcs8Buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false, ["decrypt"]
  );

  await storePrivateKey(privateKey);
}

// ─── Get private key ──────────────────────────────────────────────────────────

export async function getPrivateKey(): Promise<CryptoKey> {
  const key = await loadPrivateKey();
  if (!key) throw new Error("Private key not found. Please log in again.");
  return key;
}

// ─── Encrypt ──────────────────────────────────────────────────────────────────

export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyStr: string,
  senderPublicKeyStr: string
): Promise<EncryptedPayload> {
  const recipientPublicKey = await importPublicKey(recipientPublicKeyStr);
  const senderPublicKey = await importPublicKey(senderPublicKeyStr);

  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toAB(iv) },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);

  const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPublicKey, rawAesKey);
  const encryptedKeyForSelf = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, senderPublicKey, rawAesKey);

  return {
    ciphertext: bufToBase64(new Uint8Array(ciphertext)),
    iv: bufToBase64(iv),
    encryptedKey: bufToBase64(new Uint8Array(encryptedKey)),
    encryptedKeyForSelf: bufToBase64(new Uint8Array(encryptedKeyForSelf)),
  };
}

// ─── Decrypt ──────────────────────────────────────────────────────────────────

export async function decryptMessage(
  payload: EncryptedPayload,
  isSentByMe: boolean
): Promise<string> {
  const privateKey = await getPrivateKey();

  const rawAesKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    b64toAB(isSentByMe ? payload.encryptedKeyForSelf : payload.encryptedKey)
  );

  const aesKey = await crypto.subtle.importKey("raw", rawAesKey, "AES-GCM", false, ["decrypt"]);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64toAB(payload.iv) },
    aesKey,
    b64toAB(payload.ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert Uint8Array → plain ArrayBuffer (satisfies BufferSource in all TS configs) */
function toAB(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** base64 → ArrayBuffer directly (no Uint8Array intermediate) */
function b64toAB(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const ab = new ArrayBuffer(binary.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return ab;
}

async function deriveWrappingKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function importPublicKey(publicKeyInput: string | object): Promise<CryptoKey> {
  if (typeof publicKeyInput === "object" && publicKeyInput !== null) {
    return crypto.subtle.importKey("jwk", publicKeyInput as JsonWebKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  }
  const str = publicKeyInput as string;
  try {
    const jwk = JSON.parse(str);
    if (jwk?.kty) {
      return crypto.subtle.importKey("jwk", jwk as JsonWebKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    }
  } catch { /* fall through */ }

  // PEM or raw base64 DER
  const b64 = str.replace(/-----BEGIN [A-Z ]+-----/g, "").replace(/-----END [A-Z ]+-----/g, "").replace(/\s+/g, "");
  return crypto.subtle.importKey("spki", b64toAB(b64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
}

export function bufToBase64(buf: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buf.byteLength; i += 8192) {
    binary += String.fromCharCode(...buf.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/** @deprecated use b64toAB internally; exported for any external callers */
export function base64ToBuf(b64: string): Uint8Array {
  return new Uint8Array(b64toAB(b64));
}