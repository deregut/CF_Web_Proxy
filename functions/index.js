import { renderPage } from '../lib/ui.js';
import { escapeHtml } from '../lib/html.js';
import { configuredAccessKey, providedAccessKey } from '../lib/auth.js';
import { applySecurityHeaders } from '../lib/headers.js';

/**
 * Landing page.
 *
 * NOTE: this file *is* the `/` route of a Cloudflare Pages project. A Pages
 * Function is matched before the static asset server, so no `index.html` is
 * required at the root of the repository for the site to work.
 */
export async function onRequest(context) {
  const { request, env } = context;

  const accessKey = configuredAccessKey(env);
  const currentKey = providedAccessKey(request);
  const keyField = accessKey
    ? `<input type="hidden" name="key" value="${escapeHtml(currentKey)}">`
    : '';
  const keyNotice = accessKey
    ? `<p class="muted">This proxy is protected by an access key. Add
       <code>?key=YOUR_KEY</code> to this page once to unlock it.</p>`
    : '';

  const body = `
  <div class="card">
    <h2>About</h2>
    <p>This website helps you encode and secure your download links, and browse
       or stream remote content through a Cloudflare powered proxy.</p>
    ${keyNotice}
  </div>

  <div class="card">
    <h2>Open a URL</h2>
    <form action="/proxy" method="get" autocomplete="off">
      <input type="text" name="url" placeholder="Enter URL (e.g. https://example.com/video.mp4)" required aria-label="Enter URL" inputmode="url" spellcheck="false">
      ${keyField}
      <button type="submit">Go</button>
    </form>
    <div class="grid" style="margin-top:16px">
      <a class="button ghost" href="/proxy?url=https%3A%2F%2Fexample.com">Try a sample</a>
      <a class="button ghost" href="/health">Service status</a>
      <a class="button ghost" href="https://github.com/MinitorMHS/CF_Web_Proxy" target="_blank" rel="noopener noreferrer">Source code</a>
    </div>
  </div>

  <div class="card">
    <h2>Endpoints</h2>
    <div class="grid">
      <div><span class="tag">GET /proxy</span><p class="muted">Builds download, watch and browsing links for a target URL.</p></div>
      <div><span class="tag">GET /download</span><p class="muted">Downloads a file with pause/resume (HTTP range) support.</p></div>
      <div><span class="tag">GET /watch</span><p class="muted">Streams media, rewriting HTML pages on the fly.</p></div>
      <div><span class="tag">GET /browse</span><p class="muted">Browses a full web page with rewritten links.</p></div>
      <div><span class="tag">GET /raw</span><p class="muted">Raw passthrough for images, CSS, JavaScript and files.</p></div>
      <div><span class="tag">ANY /api</span><p class="muted">JSON/text API passthrough with CORS support.</p></div>
    </div>
  </div>

  <footer><p>CF Web Proxy &middot; powered by Cloudflare</p></footer>`;

  const html = renderPage({
    title: 'CF Web Proxy',
    description: 'Encode, download, stream and browse web content through a Cloudflare powered proxy.',
    body,
  });

  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300, must-revalidate',
  });
  applySecurityHeaders(headers, { frame: 'SAMEORIGIN' });

  return new Response(html, { headers });
}
