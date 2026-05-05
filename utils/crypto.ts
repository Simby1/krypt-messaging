import { get, set, del } from "idb-keyval";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Register: generate + wrap keys ──────────────────────────────────────────

export async function generateAndWrapKeys(password: string): Promise<KeyMaterial> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(16));
  const wrappingKey = await deriveWrappingKey(password, salt);

  const pkcs8Buffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const wrappedBuffer = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: wrapIv },
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

// ─── Login: unwrap server key into IndexedDB ──────────────────────────────────

export async function unwrapAndStorePrivateKey(
  password: string,
  wrappedPrivateKeyB64: string,
  pbkdf2SaltB64: string
): Promise<void> {
  const salt = base64ToBuf(pbkdf2SaltB64);
  const wrappingKey = await deriveWrappingKey(password, salt);

  const combined = base64ToBuf(wrappedPrivateKeyB64);
  const wrapIv = combined.slice(0, 16);
  const wrappedKey = combined.slice(16);

  const pkcs8Buffer = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: wrapIv },
    wrappingKey,
    wrappedKey
  );

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );

  await storePrivateKey(privateKey);
}

// ─── Get private key ──────────────────────────────────────────────────────────

export async function getPrivateKey(): Promise<CryptoKey> {
  const key = await loadPrivateKey();
  if (!key) throw new Error("Private key not found. Please log in again.");
  return key;
}

// ─── Encrypt a message ────────────────────────────────────────────────────────

export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyStr: string,
  senderPublicKeyStr: string
): Promise<EncryptedPayload> {
  const recipientPublicKey = await importPublicKey(recipientPublicKeyStr);
  const senderPublicKey = await importPublicKey(senderPublicKeyStr);

  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);

  const encryptedKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    rawAesKey
  );
  const encryptedKeyForSelf = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    senderPublicKey,
    rawAesKey
  );

  return {
    ciphertext: bufToBase64(new Uint8Array(ciphertext)),
    iv: bufToBase64(iv),
    encryptedKey: bufToBase64(new Uint8Array(encryptedKey)),
    encryptedKeyForSelf: bufToBase64(new Uint8Array(encryptedKeyForSelf)),
  };
}

// ─── Decrypt a message ────────────────────────────────────────────────────────

export async function decryptMessage(
  payload: EncryptedPayload,
  isSentByMe: boolean
): Promise<string> {
  const privateKey = await getPrivateKey();

  const encryptedAesKeyBuf = base64ToBuf(
    isSentByMe ? payload.encryptedKeyForSelf : payload.encryptedKey
  );

  const rawAesKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encryptedAesKeyBuf
  );

  const aesKey = await crypto.subtle.importKey(
    "raw", rawAesKey, "AES-GCM", false, ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(payload.iv) },
    aesKey,
    base64ToBuf(payload.ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function deriveWrappingKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Import a public key from any format:
 *   1. JSON string of a JWK  → '{"kty":"RSA",...}'
 *   2. Already-parsed JWK object
 *   3. PEM or raw base64 DER (e.g. "MIIBIjAN...")
 */
async function importPublicKey(publicKeyInput: string | object): Promise<CryptoKey> {
  // Case 2: already a plain object (JWK)
  if (typeof publicKeyInput === "object" && publicKeyInput !== null) {
    return crypto.subtle.importKey(
      "jwk",
      publicKeyInput as JsonWebKey,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
  }

  const str = publicKeyInput as string;

  // Case 1: JSON string → JWK
  try {
    const jwk = JSON.parse(str);
    if (jwk && typeof jwk === "object" && jwk.kty) {
      return crypto.subtle.importKey(
        "jwk",
        jwk as JsonWebKey,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"]
      );
    }
  } catch {
    // not JSON, fall through
  }

  // Case 3: PEM or raw base64 DER
  const b64 = str
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");

  const derBytes = base64ToBuf(b64);

  return crypto.subtle.importKey(
    "spki",
    derBytes,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

export function bufToBase64(buf: Uint8Array): string {
  let binary = "";
  const len = buf.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Returns a Uint8Array backed by a plain ArrayBuffer (not SharedArrayBuffer).
 * This satisfies TypeScript's strict BufferSource typing for Web Crypto APIs.
 */
export function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return view;
}