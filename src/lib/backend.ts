// Local-first app constants. No backend, no env config.
// Data lives in IndexedDB (Dexie); session in localStorage.

export const STORE_ID = 'main-store';
export const STORE_NAME = 'Main Store';
export const STORE_LOCATION = 'Kiserian, Kajiado County, Kenya';

export interface LocalUser {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'cashier';
}

export const USERS: LocalUser[] = [
  { id: 'user-admin-1', email: 'admin@wakulima.local', full_name: 'Store Admin', role: 'admin' },
  { id: 'user-cashier-1', email: 'cashier@wakulima.local', full_name: 'Cashier', role: 'cashier' },
];

const SESSION_KEY = 'wakulima-session';

export function getSession(): LocalUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as LocalUser) : null;
  } catch {
    return null;
  }
}

export function setSession(user: LocalUser | null) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
}
