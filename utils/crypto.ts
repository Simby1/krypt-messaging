import { set } from 'idb-keyval';

//creating keys
export async function generateUserKeys() {
  // 1. Generate Public and Private key
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, 
    ["encrypt", "decrypt"]
  );

  // 2. keep Physical Key (IndexedDB)
  await set('krypt-private-key', keyPair.privateKey);

  // 3. Prepare the Padlock to be sent to the server (Export to JSON)
  const publicJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);

  return publicJwk;
}

// to send messages
export async function encryptForRecipient(message: string, recipientJwk: any) {
  // 1. Import/get recipeints public key
  const publicKey = await window.crypto.subtle.importKey(
    "jwk",
    recipientJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );

  // 2. generate senders aes key
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );

  // 3. Lock Message in Box
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedMessage = new TextEncoder().encode(message);
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encodedMessage
  );

  // 4. Lock the AES Key in the Envelope with recipients public key
  const exportedAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedEnvelope = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    exportedAesKey
  );

  // Convert to strings for the API
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encryptedContent))),
    envelope: btoa(String.fromCharCode(...new Uint8Array(encryptedEnvelope))),
    iv: btoa(String.fromCharCode(...iv))
  };
}