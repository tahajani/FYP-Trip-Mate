import { getToken } from './tokenStorage';

// Same storage the login and api.ts use, so the chat and the owner check always see the logged-in token.
export async function getAuthToken(): Promise<string | null> {
  return (await getToken()) ?? null;
}

// The id inside the JWT (used to know "me" and the group owner). Returns null when the token cannot be read.
export function userIdFromToken(token: string): string | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(atob(part));
    return String(p.id || p.userId || p._id || '') || null; // same fields as server.js verifyToken
  } catch {
    return null;
  }
}