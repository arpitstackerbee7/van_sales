/**
 * Talking to Frappe.
 *
 * Two things this layer has to get right.
 *
 * First, errors. Frappe puts the message a human should read inside
 * `_server_messages` -- a JSON string containing an array of JSON strings.
 * If we do not unwrap that, every validation failure reaches the rep as
 * "Internal Server Error" and they have no idea the credit limit stopped
 * them.
 *
 * Second, telling "no signal" apart from "the server said no". A van drives
 * through basements all day; a request that never left the handset must be
 * retried, while a 417 from a validation rule must not be. `ApiError.offline`
 * is what the outbox keys off.
 */

import type { Bootstrap } from './types';

export class ApiError extends Error {
  readonly status: number;
  /** True when the request never reached the server. Safe to retry. */
  readonly offline: boolean;
  readonly exception?: string;

  constructor(
    message: string,
    opts: { status?: number; offline?: boolean; exception?: string } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status ?? 0;
    this.offline = opts.offline ?? false;
    this.exception = opts.exception;
  }
}

export interface Credentials {
  site: string;
  apiKey: string;
  apiSecret: string;
}

const TIMEOUT_MS = 20_000;

/** Pull the readable message out of a Frappe error body. */
function frappeMessage(body: any, fallback: string): string {
  const serverMessages = body?._server_messages;
  if (typeof serverMessages === 'string') {
    try {
      const list = JSON.parse(serverMessages) as string[];
      const messages = list
        .map((entry) => {
          try {
            return JSON.parse(entry)?.message ?? entry;
          } catch {
            return entry;
          }
        })
        .filter(Boolean);
      if (messages.length) return stripHtml(messages.join('\n'));
    } catch {
      /* fall through to the other shapes below */
    }
  }

  if (typeof body?.message === 'string' && body.message) return stripHtml(body.message);
  if (typeof body?.exc_type === 'string' && body.exc_type) return body.exc_type;

  return fallback;
}

/** Frappe messages are HTML fragments; a phone wants plain text. */
function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function normaliseSite(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Plain hostnames typed on a phone default to http for .localhost dev
  // sites and https everywhere else.
  const scheme = /(^|\.)localhost(:\d+)?$/i.test(trimmed) ? 'http' : 'https';
  return `${scheme}://${trimmed}`;
}

interface CallOptions {
  method?: 'GET' | 'POST';
  args?: Record<string, unknown>;
  credentials?: Credentials | null;
  site?: string;
  signal?: AbortSignal;
}

/** Call a whitelisted method and return its `message` payload. */
export async function call<T = unknown>(
  dottedPath: string,
  { method = 'GET', args = {}, credentials = null, site, signal }: CallOptions = {},
): Promise<T> {
  const base = site ?? credentials?.site;
  if (!base) throw new ApiError('No site configured.');

  let url = `${base}/api/method/${dottedPath}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };

  if (credentials) {
    headers.Authorization = `token ${credentials.apiKey}:${credentials.apiSecret}`;
  }

  let body: string | undefined;
  if (method === 'GET') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(args)) {
      if (value === undefined || value === null) continue;
      query.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const qs = query.toString();
    if (qs) url += `?${qs}`;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(args);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => controller.abort());

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal: controller.signal });
  } catch (error: any) {
    // fetch only rejects on transport failure, so this is genuinely "did not
    // arrive" -- never a rejection the server chose to send.
    const aborted = error?.name === 'AbortError';
    throw new ApiError(
      aborted ? 'The server took too long to answer.' : 'No connection to the server.',
      { offline: true },
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(frappeMessage(payload, 'Your session is no longer valid.'), {
        status: response.status,
        exception: payload?.exc_type,
      });
    }
    throw new ApiError(frappeMessage(payload, `Request failed (${response.status}).`), {
      status: response.status,
      exception: payload?.exc_type,
    });
  }

  return (payload?.message ?? payload) as T;
}

/** Exchange credentials for an API key pair. */
export async function login(
  site: string,
  usr: string,
  pwd: string,
  device: { id?: string; name?: string } = {},
): Promise<{ api_key: string; api_secret: string; bootstrap: Bootstrap }> {
  return call('van_sales.api.auth.login', {
    method: 'POST',
    site,
    args: { usr, pwd, device_id: device.id, device_name: device.name },
  });
}
