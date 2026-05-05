# KRYPT: End-to-End Encrypted Messaging

## 🛡️ Security Architecture

KRYPT is built on the principle of Zero-Knowledge. The server acts as a blind postman—it delivers encrypted packets but never possesses the keys to open them.

### Key Management

**Asymmetric Keys:** Upon initialization, the client generates an RSA-OAEP (2048-bit) key pair using the Web Crypto API.

**Private Key Storage:** The Private Key is stored in IndexedDB using idb-keyval. It never leaves the browser and is never sent over the network.

**Public Key Exchange:** Public keys are registered on the backend /users endpoint, allowing users to discover each other's "padlocks."

### Encryption Flow (The Hybrid Approach)

To balance security and performance, KRYPT uses a hybrid encryption model:

**Symmetric Encryption:** The message content is encrypted using AES-GCM with a one-time random session key.

**Asymmetric Wrapping:** The AES session key is then encrypted (wrapped) using the recipient's RSA-OAEP Public Key.

**Transmission:** The server receives a "Payload" containing the ciphertext, the encrypted key bundle (envelope), and the Initialization Vector (IV).

### Authentication

**JWT (JSON Web Tokens):** Secure session management is handled via JWT. Every request to the /messages and /users endpoints requires a valid Bearer token, ensuring that only authenticated users can interact with the signal node.

## 🚀 Technical Stack

- Frontend: Next.js, Tailwind CSS v4, Lucide Icons.
- Security: Web Crypto API, IndexedDB.
- Backend: Whisperbox API (E2EE Optimized).

## ⚠️ Security Trade-offs & Limitations

- Device Binding: Since the Private Key is stored in IndexedDB, messages can only be decrypted on the device they were received on.
- Metadata: While the message body is fully encrypted, the server can still see who is talking to whom (traffic analysis).