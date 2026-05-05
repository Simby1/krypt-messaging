import { set } from 'idb-keyval';

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