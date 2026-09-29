import { describe, expect, it } from 'vitest';
import { advanceSnapshotGeneration, publicSnapshotAddress, readPageSnapshot, serveOrRenderPage,
  snapshotAddress, snapshotKey, writePageSnapshot, type PageSnapshotBucket } from '../src/lib/page-snapshots';

function bucket(): PageSnapshotBucket {
  const objects = new Map<string, { bytes: ArrayBuffer; customMetadata: Record<string, string> }>();
  return {
    async head(key) { return objects.get(key) ?? null; },
    async get(key) {
      const object = objects.get(key);
      return object ? { body: new Response(object.bytes).body!, customMetadata: object.customMetadata } : null;
    },
    async put(key, body, options) {
      const bytes = typeof body === 'string' ? new TextEncoder().encode(body).buffer : body;
      objects.set(key, { bytes, customMetadata: options.customMetadata });
      return null;
    },
    async delete(key) { objects.delete(key); },
  };
}

const html = (body = '<html><body>' + 'public content '.repeat(10) + '</body></html>') =>
  new Response(body, { headers: { 'content-type': 'text/html', 'Cache-Tag': 'tenant:exemplo,posts:1',
    'Link': '<https://exemplo.test/post.md>; rel="alternate"; type="text/markdown"' } });

describe('public HTML snapshots', () => {
  it('accepts only canonical host/path keys', () => {
    expect(snapshotKey(snapshotAddress('exemplo.test', '/ofertas/teste/')!))
      .toBe('public-html/v1/pages/exemplo.test/ofertas/teste/index.html');
    expect(snapshotAddress('exemplo.test', '/ofertas/../privado/')).toBeNull();
    expect(snapshotAddress('exemplo.test', '/r/f42')).toBeNull();
    expect(snapshotAddress('evil.example/a', '/')).toBeNull();
    expect(publicSnapshotAddress(new Request('https://exemplo.test/post/?utm_source=agent'),
      ['exemplo.test'], path => path === '/post/')).toEqual({ host: 'exemplo.test', pathname: '/post/' });
    expect(publicSnapshotAddress(new Request('https://exemplo.test/post/?preview=1'),
      ['exemplo.test'], () => true)).toBeNull();
    expect(publicSnapshotAddress(new Request('https://exemplo.test/post/', {
      headers: { accept: 'text/markdown' },
    }), ['exemplo.test'], () => true)).toBeNull();
  });

  it('serves a current page and rejects the old generation after publication', async () => {
    const store = bucket();
    const address = snapshotAddress('exemplo.test', '/post/')!;
    const first = await advanceSnapshotGeneration(store, address);
    const rendered = html();
    rendered.headers.set('Origin-Trial', 'webmcp-test-token');
    expect(await writePageSnapshot(store, address, first, rendered)).toBe('stored');
    const served = await readPageSnapshot(store, address, 60_000);
    expect(served?.status).toBe(200);
    expect(served?.headers.get('cache-tag')).toContain('snapshot:exemplo.test');
    expect(served?.headers.get('cache-tag')).toContain('snapshot:all');
    expect(served?.headers.get('link')).toContain('post.md');
    expect(served?.headers.get('origin-trial')).toBe('webmcp-test-token');
    expect(await served?.text()).toContain('public content');
    const next = await advanceSnapshotGeneration(store, address);
    expect(next).not.toBe(first);
    expect(await readPageSnapshot(store, address, 60_000)).toBeNull();
  });

  it('never stores private, malformed or non-HTML responses and deletes a withdrawn page', async () => {
    const store = bucket();
    const address = snapshotAddress('outro.exemplo.test', '/oferta/teste/')!;
    const generation = await advanceSnapshotGeneration(store, address);
    expect(await writePageSnapshot(store, address, generation,
      new Response('x'.repeat(120), { headers: { 'content-type': 'text/html', 'set-cookie': 'session=1' } })))
      .toBe('skipped');
    expect(await writePageSnapshot(store, address, generation, html())).toBe('stored');
    expect(await writePageSnapshot(store, address, generation, new Response(null, { status: 404 })))
      .toBe('removed');
    expect(await readPageSnapshot(store, address, 60_000)).toBeNull();
  });

  it('does not accept a render that started before a newer publication', async () => {
    const store = bucket();
    const address = snapshotAddress('exemplo.test', '/post/')!;
    const previous = await advanceSnapshotGeneration(store, address);
    await advanceSnapshotGeneration(store, address);
    expect(await writePageSnapshot(store, address, previous, html())).toBe('skipped');
  });

  it('keeps an unrelated page hot after another path is published', async () => {
    const store = bucket();
    const changed = snapshotAddress('exemplo.test', '/novo/')!;
    const untouched = snapshotAddress('exemplo.test', '/antigo/')!;
    await writePageSnapshot(store, changed, await advanceSnapshotGeneration(store, changed), html());
    await writePageSnapshot(store, untouched, await advanceSnapshotGeneration(store, untouched), html());
    await advanceSnapshotGeneration(store, changed);
    expect(await readPageSnapshot(store, changed, 60_000)).toBeNull();
    expect((await readPageSnapshot(store, untouched, 60_000))?.status).toBe(200);
  });

  it('fills on first visit and falls back to Astro after a generation change', async () => {
    const store = bucket();
    const address = snapshotAddress('exemplo.test', '/post/')!;
    const tasks: Promise<unknown>[] = [];
    let renders = 0;
    const render = async () => { renders++; return html(); };
    const load = () => serveOrRenderPage(store, address, 60_000, render, task => { tasks.push(task); });
    const fallback = await load();
    expect(fallback.headers.get('x-page-origin')).toBeNull();
    expect(fallback.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=30');
    expect(fallback.headers.get('cache-tag')).toContain('snapshot:all');
    await Promise.all(tasks);
    expect((await load()).headers.get('x-page-origin')).toBe('r2');
    expect(renders).toBe(1);
    await advanceSnapshotGeneration(store, address);
    expect((await load()).headers.get('x-page-origin')).toBeNull();
    expect(renders).toBe(2);
  });

  it('uses Astro when R2 is unavailable', async () => {
    const store = bucket();
    store.get = async () => { throw new Error('R2 offline'); };
    const address = snapshotAddress('outro.exemplo.test', '/post/')!;
    const response = await serveOrRenderPage(store, address, 60_000, async () => html(), () => {});
    expect(response.status).toBe(200);
    expect(response.headers.get('x-page-origin')).toBeNull();
  });
});
