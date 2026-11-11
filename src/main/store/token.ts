import { safeStorage } from 'electron';
import Store from 'electron-store';

// The Notion token is encrypted with the OS keystore (DPAPI on Windows,
// Keychain on macOS) before it touches disk. Only the ciphertext is stored,
// base64-encoded. The token is never logged and never sent to the renderer.
const store = new Store<{ notionToken: string }>({
  name: 'secrets',
  defaults: { notionToken: '' },
});

/** True when a token has been saved. Safe to expose to the renderer. */
export function hasToken(): boolean {
  return store.get('notionToken') !== '';
}

/**
 * Encrypt and save the token. Refuses to save when OS encryption is not
 * available, rather than falling back to plain text.
 */
export function saveToken(token: string): void {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('The token is empty.');
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is not available on this computer, so the token was not saved.');
  }
  store.set('notionToken', safeStorage.encryptString(trimmed).toString('base64'));
}

/** Decrypt the saved token for use in the main process, or null if none. */
export function loadToken(): string | null {
  const encrypted = store.get('notionToken');
  if (!encrypted) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch {
    // The ciphertext is tied to this Windows user. If it cannot be read
    // (profile moved, file copied from another PC), treat it as missing.
    return null;
  }
}

export function clearToken(): void {
  store.set('notionToken', '');
}
