import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

// NOT VERIFIED: I have not seen api.ts. Make this read the token from the same place api.ts does.
export async function getAuthToken(): Promise<string | null> {
  const header = (api.defaults.headers.common as any)?.Authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
  return AsyncStorage.getItem('token'); // CHANGE 'token' to your key
}

export function userIdFromToken(token: string): string | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(atob(part));
    return String(p.id || p.userId || p._id || '') || null;
  } catch {
    return null;
  }
}