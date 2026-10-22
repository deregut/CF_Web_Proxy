import { renderPage, copyButton, COPY_SCRIPT } from '../lib/ui.js';
import { escapeHtml } from '../lib/html.js';
import { encodePayload } from '../lib/codec.js';
import { validateTarget, deriveFilename, ProxyError } from '../lib/guard.js';
import { buildPolicy } from '../lib/target.js';
import { applySecurityHeaders } from '../lib/headers.js';
import { accessKeyParam, checkAccess } from '../lib/auth.js';

/**
 * `/proxy` — turns a target URL into download / watch / browse / raw links.
 *
 * Security fix: the original version interpolated the file name (derived from
 * the user supplied URL) straight into the HTML, which allowed reflected XSS
 * through `?url=http://example.com/<img src=x onerror=alert(1)>`. Every value
 * is now escaped.
 */
export async function onRequest(context) {
  const { request, env } = context;

  const denied = checkAccess(context);
  if (denied) return denied;

  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get('url');

  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  applySecurityHeaders(headers, { frame: 'SAMEORIGIN' });

  if (!rawUrl) {
    return new Response(
      renderPage({
        title: 'Missing URL | CF Web Proxy',
        description: 'No target URL was supplied.',
        body: `<div class="card error"><strong>Missing URL.</strong>
          <p class="muted">Add a <code>url</code> parameter, for example
          <code>/proxy?url=https://example.com/file.mp4</code>.</p></div>
          <footer><p>CF Web Proxy</p></footer>`,
      }),
      { status: 400, headers },
    );
  }

  let target;
  try {
    const policy = await buildPolicy(context);
    target = validateTarget(rawUrl, policy);
  } catch (error) {
    const status = error instanceof ProxyError ? error.status : 400;
    return new Response(
      renderPage({
        title: 'Blocked | CF Web Proxy',
        description: 'The requested URL cannot be proxied.',
        body: `<div class="card error"><strong>${escapeHtml(error.message || 'Invalid URL')}</strong>
          <p class="muted">Only public <code>http</code> and <code>https</code> URLs can be proxied.</p></div>
          <div class="card"><a class="button" href="/">&larr; Back</a></div>
          <footer><p>CF Web Proxy</p></footer>`,
      }),
      { status, headers },
    );
  }

  const filename = deriveFilename(target);
  const origin = requestUrl.origin;
  const keyParam = accessKeyParam(env, request);

  // The legacy upstream media host only understands the original padded
  // base64 scheme, so keep using it (but URL encode it) for that host only.
  const legacyMediaHost = 'proxy.minitor.eu.org';
  const mediaBase = env.MEDIA_PROXY_BASE
    ? String(env.MEDIA_PROXY_BASE).replace(/\/+$/, '')
    : requestUrl.hostname === legacyMediaHost
      ? 'https://cfproxy.global.ssl.fastly.net'
      : origin;
  const legacy = mediaBase !== origin;

  const token = encodePayload({ url: target.toString(), filename }, { legacy });
  const suffix = legacy ? encodeURIComponent(token) : token;
  const localSuffix = encodePayload({ url: target.toString(), filename });

  const links = {
    download: `${mediaBase}/download?data=${suffix}${keyParam}`,
    watch: `${mediaBase}/watch?data=${suffix}${keyParam}`,
    browse: `${origin}/browse?data=${localSuffix}${keyParam}`,
    raw: `${origin}/raw?data=${localSuffix}${keyParam}`,
  };

  const rows = [
    { id: 'downloadLink', label: 'Download', href: links.download, className: 'green' },
    { id: 'watchLink', label: 'Watch', href: links.watch, className: 'blue' },
    { id: 'browseLink', label: 'Open page', href: links.browse, className: '' },
    { id: 'rawLink', label: 'Raw file', href: links.raw, className: 'ghost' },
  ]
    .map(
      (row) => `<div class="card">
        <h2>${escapeHtml(row.label)}</h2>
        <div class="link-box">
          <span class="url" id="${row.id}" data-value="${escapeHtml(row.href)}">${escapeHtml(row.href)}</span>
          ${copyButton(row.id)}
        </div>
        <div class="button-row">
          <a class="button ${row.className}" href="${escapeHtml(row.href)}" rel="noopener noreferrer">Open</a>
        </div>
      </div>`,
    )
    .join('');

  const body = `
  <div class="card">
    <h1>Proxy links</h1>
    <p class="muted">Target</p>
    <div class="link-box"><span class="url">${escapeHtml(target.toString())}</span></div>
    <p class="muted">File name: <strong>${escapeHtml(filename)}</strong></p>
    ${legacy ? '<p class="muted"><span class="tag">external media host</span> Media links are served by the configured upstream media host.</p>' : ''}
  </div>
  ${rows}
  <div class="card"><a class="button ghost" href="/">&larr; Back</a></div>
  <footer><p>CF Web Proxy</p></footer>`;

  const html = renderPage({
    title: `Proxy | ${filename}`,
    description: 'Download, watch or browse the requested URL through the proxy.',
    body,
    script: `<script>${COPY_SCRIPT}</script>`,
  });

  return new Response(html, { headers });
}
