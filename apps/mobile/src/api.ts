import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import type { Actor } from "./types";

/**
 * The app talks to the same /api/v1 as the website. Set the server with
 * EXPO_PUBLIC_API_URL (or "extra.apiUrl" in app.json). The sign-in token is kept
 * in the phone's secure storage (Keychain / Keystore), never in plain storage.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = "slb_token";

let token: string | null = null;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body?: unknown) {
    super(message);
  }
}

export async function loadToken() {
  token = await SecureStore.getItemAsync(KEY);
  return token;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "offline", "No connection. Check your network and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code: string; message: string } };
  // A blocked booking comes back as 409 with { ok: false, reason, alternatives }: callers handle it.
  if (res.status === 409 && json.ok === false) return json as T;
  if (!res.ok) throw new ApiError(res.status, json.error?.code ?? "error", json.error?.message ?? "Something went wrong. Try again.", json);
  return json as T;
}

export async function signIn(email: string): Promise<Actor> {
  const r = await api<{ actor: Actor; token: string }>("/session", { body: { email, client: "app" } });
  token = r.token;
  await SecureStore.setItemAsync(KEY, r.token);
  return r.actor;
}

export async function me(): Promise<Actor | null> {
  if (!token) return null;
  const r = await api<{ actor: Actor | null }>("/session").catch(() => ({ actor: null }));
  return r.actor;
}

export async function signOut() {
  token = null;
  await SecureStore.deleteItemAsync(KEY);
}
