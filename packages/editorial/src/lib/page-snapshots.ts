/** HTML public snapshots. The CMS remains the source of truth; R2 is an origin cache. */
const PREFIX = 'public-html/v1';
const MAX_HTML_BYTES = 2_000_000;
const HOST = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const PATH = /^\/(?:[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\/)*$/;
const GENERATION = /^[a-f0-9-]{36}$/;
const TRACKING = /^(?:utm_[a-z0-9_]+|gclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|as)$/i;
export const SNAPSHOT_PURGE_TAG = 'snapshot:all';

function appendSnapshotTags(headers: Headers, host: string): void {
  const tags = new Set((headers.get('Cache-Tag') ?? '').split(',').map(tag => tag.trim()).filter(Boolean));
  tags.add(SNAPSHOT_PURGE_TAG);
  tags.add(`snapshot:${host}`);
  headers.set('Cache-Tag', [...tags].join(','));
}

export interface PageSnapshotBucket {
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>;
  get(key: string): Promise<{ body: ReadableStream; customMetadata?: Record<string, string> } | null>;
  put(key: string, body: ArrayBuffer | string, options: {
    httpMetadata: { contentType: string };
    customMetadata: Record<string, string>;
  }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

export interface SnapshotAddress { host: string; pathname: string }

/** Excludes personalized, negotiated and query-sensitive requests before the R2 lookup. */
export function publicSnapshotAddress(request: Request, allowedHosts: readonly string[],
  publicRoute: (pathname: string) => boolean): SnapshotAddress | null {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !allowedHosts.includes(url.hostname.toLowerCase()) ||
      !publicRoute(url.pathname) || url.pathname.includes('%') || url.pathname.includes('//') ||
      request.headers.has('authorization') || request.headers.has('cookie') ||
      request.headers.has('range') || /no-cache|no-store/i.test(request.headers.get('cache-control') ?? '') ||
      /text\/markdown/i.test(request.headers.get('accept') ?? '') ||
      [...url.searchParams.keys()].some(key => !TRACKING.test(key))) return null;
  return snapshotAddress(url.hostname, url.pathname);
}

export function snapshotAddress(host: string, pathname: string): SnapshotAddress | null {
  const normalizedHost = host.toLowerCase();
  return HOST.test(normalizedHost) && normalizedHost.length <= 100 &&
    PATH.test(pathname) && pathname.length <= 500 ? { host: normalizedHost, pathname } : null;
}

export function snapshotKey(address: SnapshotAddress): string {
  const valid = snapshotAddress(address.host, address.pathname);
  if (!valid || valid.host !== address.host || valid.pathname !== address.pathname)
    throw new Error('invalid public snapshot address');
  return `${PREFIX}/pages/${address.host}${address.pathname}index.html`;
}

function generationKey(address: SnapshotAddress): string {
  const valid = snapshotAddress(address.host, address.pathname);
  if (!valid) throw new Error('invalid public snapshot address');
  return `${PREFIX}/generations/${address.host}${address.pathname}generation`;
}

/** Invalidate just the changed path; unrelated pages stay hot in R2. */
export async function advanceSnapshotGeneration(bucket: PageSnapshotBucket, address: SnapshotAddress): Promise<string> {
  const generation = crypto.randomUUID();
  await bucket.put(generationKey(address), '', {
    httpMetadata: { contentType: 'text/plain' }, customMetadata: { generation },
  });
  return generation;
}

export async function currentSnapshotGeneration(bucket: PageSnapshotBucket, address: SnapshotAddress): Promise<string | null> {
  const generation = (await bucket.head(generationKey(address)))?.customMetadata?.generation;
  return generation && GENERATION.test(generation) ? generation : null;
}

const snapshotHeaders = (metadata: Record<string, string>, host: string) => {
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=0',
    'Cloudflare-CDN-Cache-Control': 'public, max-age=60',
    'X-Page-Origin': 'r2',
  });
  for (const [field, key] of [['Cache-Tag', 'tags'], ['X-Robots-Tag', 'robots'],
    ['Link', 'link'], ['Vary', 'vary'], ['Origin-Trial', 'originTrial'],
    ['Content-Language', 'language'], ['Content-Security-Policy', 'csp'],
    ['Referrer-Policy', 'referrerPolicy'], ['Permissions-Policy', 'permissionsPolicy']] as const) {
    const value = metadata[key];
    if (value && value.length <= 1024 && !/[\r\n]/.test(value)) headers.set(field, value);
  }
  appendSnapshotTags(headers, host);
  return headers;
};

/** The first uncached render has a short edge lifetime; subsequent visits read R2. */
function publicRenderFallback(response: Response, host: string): Response {
  if (response.status !== 200 || !/^text\/html\b/i.test(response.headers.get('content-type') ?? '') ||
      response.headers.has('set-cookie') ||
      /private|no-store|no-cache/i.test(response.headers.get('cache-control') ?? '')) return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=0');
  headers.set('Cloudflare-CDN-Cache-Control', 'public, max-age=30');
  appendSnapshotTags(headers, host);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

type SnapshotRead = { response: Response; generation: string; stale: boolean };

async function inspectPageSnapshot(bucket: PageSnapshotBucket, address: SnapshotAddress,
  maxAgeMs: number): Promise<SnapshotRead | null> {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return null;
  const [generation, object] = await Promise.all([
    currentSnapshotGeneration(bucket, address), bucket.get(snapshotKey(address)),
  ]);
  const metadata = object?.customMetadata;
  const storedAt = Number(metadata?.storedAt);
  const now = Date.now();
  if (!generation || !object || metadata?.generation !== generation ||
      metadata.host !== address.host || metadata.pathname !== address.pathname ||
      !Number.isFinite(storedAt) || storedAt > now)
    return null;
  const stale = now - storedAt > maxAgeMs;
  const headers = snapshotHeaders(metadata, address.host);
  if (stale) {
    // Keep the first visit fast while the CMS refreshes the copy in waitUntil.
    // A short edge lifetime lets the refreshed object replace it within seconds.
    headers.set('Cloudflare-CDN-Cache-Control', 'public, max-age=30');
    headers.set('X-Page-Stale', '1');
  }
  return { response: new Response(object.body, { status: 200, headers }), generation, stale };
}

/** A hard-freshness read for callers that must not consume an expired copy. */
export async function readPageSnapshot(bucket: PageSnapshotBucket, address: SnapshotAddress,
  maxAgeMs: number): Promise<Response | null> {
  const snapshot = await inspectPageSnapshot(bucket, address, maxAgeMs);
  if (!snapshot) return null;
  if (snapshot.stale) {
    await snapshot.response.body?.cancel();
    return null;
  }
  return snapshot.response;
}

export type SnapshotWriteResult = 'stored' | 'removed' | 'skipped';

/** Writes only a complete, public HTML response. A 404/410 removes an obsolete slug. */
export async function writePageSnapshot(bucket: PageSnapshotBucket, address: SnapshotAddress,
  generation: string, response: Response): Promise<SnapshotWriteResult> {
  if (!GENERATION.test(generation)) throw new Error('invalid public snapshot generation');
  const key = snapshotKey(address);
  if (await currentSnapshotGeneration(bucket, address) !== generation) return 'skipped';
  if (response.status === 404 || response.status === 410) {
    await bucket.delete(key);
    return 'removed';
  }
  const type = response.headers.get('content-type') ?? '';
  const control = response.headers.get('cache-control') ?? '';
  if (response.status !== 200 || !/^text\/html\b/i.test(type) ||
      response.headers.has('set-cookie') || /private|no-store|no-cache/i.test(control)) return 'skipped';
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_HTML_BYTES) return 'skipped';
  // If a newer publication advanced the generation during rendering, never replace it.
  if (await currentSnapshotGeneration(bucket, address) !== generation) return 'skipped';
  const metadata: Record<string, string> = {
    generation, host: address.host, pathname: address.pathname, storedAt: String(Date.now()),
  };
  for (const [field, key] of [['Cache-Tag', 'tags'], ['X-Robots-Tag', 'robots'],
    ['Link', 'link'], ['Vary', 'vary'], ['Origin-Trial', 'originTrial'],
    ['Content-Language', 'language'], ['Content-Security-Policy', 'csp'],
    ['Referrer-Policy', 'referrerPolicy'], ['Permissions-Policy', 'permissionsPolicy']] as const) {
    const value = response.headers.get(field);
    if (value && value.length <= 1024 && !/[\r\n]/.test(value)) metadata[key] = value;
  }
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' }, customMetadata: metadata,
  });
  return 'stored';
}

/** R2 errors never replace the authoritative Astro response; the write is best-effort. */
export async function serveOrRenderPage(bucket: PageSnapshotBucket | undefined,
  address: SnapshotAddress, maxAgeMs: number, renderFresh: () => Promise<Response>,
  waitUntil: (task: Promise<unknown>) => void): Promise<Response> {
  if (!bucket) return renderFresh();
  let generation: string;
  try {
    const cached = await inspectPageSnapshot(bucket, address, maxAgeMs);
    if (cached) {
      if (cached.stale) {
        waitUntil((async () => {
          try {
            const fresh = await renderFresh();
            if (fresh.status === 200 || fresh.status === 404 || fresh.status === 410)
              await writePageSnapshot(bucket, address, cached.generation, fresh);
          } catch { /* Keep serving the last valid public snapshot during CMS failures. */ }
        })());
      }
      return cached.response;
    }
    generation = await currentSnapshotGeneration(bucket, address) ??
      await advanceSnapshotGeneration(bucket, address);
  } catch {
    return publicRenderFallback(await renderFresh(), address.host);
  }
  const response = await renderFresh();
  if (response.status === 200 || response.status === 404 || response.status === 410) {
    const copy = response.clone();
    waitUntil((async () => {
      try {
        await writePageSnapshot(bucket, address, generation, copy);
      } catch { /* Astro remains the source of truth on R2 write failure. */ }
    })());
  }
  return publicRenderFallback(response, address.host);
}
