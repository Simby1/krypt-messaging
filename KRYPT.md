# Krypt // End-to-End Encrypted Messaging

Krypt is a high-performance, minimalist messaging platform that ensures that privacy is not a feature, but a foundational law.

## 🏗 Architectural Standards
- **Trustless Backend:** The server (Koyeb API) acts as a blind relay. It never sees, stores, or processes plaintext.
- **Hybrid Encryption:** Combines RSA-OAEP (2048-bit) for secure key exchange and AES-GCM (256-bit) for high-speed data encryption.
- **Non-Extractable Keys:** Private keys are stored in **IndexedDB** using the Web Crypto API, ensuring they cannot be accessed by standard XSS attacks or exported from the browser.

## 🔐 Encryption Flow (The "Handshake")
1. **Key Gen:** On first-run, Krypt generates a unique RSA-OAEP pair.
2. **Identity:** The Public Key is sent to the Whisperbox API; the Private Key is locked in the local IndexedDB.
3. **Transmission:** 
   - Sender fetches Recipient's Public Key.
   - Sender generates a random AES-256 session key.
   - Message is encrypted via AES-GCM.
   - AES Key is wrapped (encrypted) with the Recipient's RSA Public Key.
4. **Reception:** Recipient unwraps the AES key using their Private Key and decrypts the message.



## 🛠 Tech Stack
- **Frontend:** Next.js 15, Tailwind CSS v4, Framer Motion.
- **Crypto:** Web Crypto API (Native Browser Support).
- **Storage:** IndexedDB (via idb-keyval).