import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const isJwt = (v: unknown): v is string => typeof v === 'string' && JWT_RE.test(v);

// a value may be the JWT itself, or JSON like {"token":"..."}
function pick(raw: string | null): string | null {
  if (!raw) return null;
  if (isJwt(raw)) return raw;
  try {
    const o = JSON.parse(raw);
    if (isJwt(o?.token)) return o.token;
    if (isJwt(o?.accessToken)) return o.accessToken;
  } catch {
    /* not JSON */
  }
  return null;
}

// likely token keys first
const rank = (k: string) => (/token|jwt|auth/i.test(k) ? 0 : 1);

export async function getAuthToken(): Promise<string | null> {
  // 1) the header api.ts already sets
  const header = (api.defaults.headers.common as any)?.Authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);

  // 2) AsyncStorage (on web it is backed by localStorage)
  try {
    const keys = [...(await AsyncStorage.getAllKeys())].sort((a, b) => rank(a) - rank(b));
    for (const k of keys) {
      const t = pick(await AsyncStorage.getItem(k));
      if (t) return t;
    }
  } catch {
    /* ignore */
  }

  // 3) plain localStorage (web)
  try {
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage).sort((a, b) => rank(a) - rank(b));
      for (const k of keys) {
        const t = pick(localStorage.getItem(k));
        if (t) return t;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
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