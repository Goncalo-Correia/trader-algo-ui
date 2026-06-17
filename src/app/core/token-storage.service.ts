import { Injectable } from '@angular/core';

const TOKEN_KEY = 'traderAlgo.authToken';

/**
 * Holds the bearer token used to authenticate API/WebSocket requests.
 *
 * The login flow that populates this is backend-dependent and not yet wired
 * up; until a token is set, requests are sent unauthenticated exactly as
 * before. Once the backend exposes auth, call {@link setToken} after login.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private token: string | null = this.read();

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // localStorage may be unavailable (private mode / SSR) — keep in memory.
    }
  }

  clear(): void {
    this.setToken(null);
  }

  private read(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
}
