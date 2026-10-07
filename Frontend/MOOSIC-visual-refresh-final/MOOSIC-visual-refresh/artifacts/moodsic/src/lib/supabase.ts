import { createClient } from '@supabase/supabase-js';

const projectUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const publicKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const supabaseConfigured = Boolean(projectUrl && publicKey);
export const supabase = supabaseConfigured
  ? createClient(projectUrl, publicKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Moosic is waiting for its Supabase connection. Finish project setup to sign in.');
  }
  return supabase;
}

/** The SDK refreshes expiring sessions before a request. Never use a cached JWT. */
export async function supabaseApiRequest(path: string, options: RequestInit = {}, authenticated = true): Promise<unknown> {
  const client = requireSupabase();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (authenticated && !session) throw new Error('Your session has expired. Please sign in again.');

  const headers = new Headers(options.headers);
  headers.set('apikey', publicKey);
  if (session) headers.set('Authorization', `Bearer ${session.access_token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${projectUrl}/functions/v1/api${path}`, { ...options, headers });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Moosic could not reach its server. Check your connection and try again.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail ?? payload?.message ?? `Request failed (${response.status}). Please try again.`);
  }
  return payload;
}
