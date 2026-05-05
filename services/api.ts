const BASE_URL = 'https://whisperbox.koyeb.app';

export async function registerUser(username: string, publicKey: any) {
  const response = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      public_key: publicKey, 
    }),
  });
  return response.json();
}