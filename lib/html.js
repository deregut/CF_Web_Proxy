/**
 * HTML escaping and HTML/CSS rewriting for the browsing proxy.
 */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for safe interpolation into HTML text or an attribute. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Escape a value for safe interpolation into a URL query parameter. */
export function escapeAttr(value) {
  return escapeHtml(value);
}

/** Protocols that must never be rewritten (they are not fetchable). */
const OPAQUE_PROTOCOLS = /^(?:javascript|data|blob|about|mailto|tel|sms|magnet|file|ws|wss):/i;

/**
 * Resolve a possibly relative URL against the current document base.
 * Returns `null` when the URL cannot be resolved or uses an opaque protocol.
 */
export function resolveUrl(raw, baseUrl) {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (value.startsWith('#')) return null;
  if (OPAQUE_PROTOCOLS.test(value)) return null;
  try {
    const resolved = new URL(value, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'poster',
  'action',
  'formaction',
  'data-src',
  'data-href',
  'data-original',
  'data-lazy-src',
  'cite',
  'background',
  'longdesc',
  'manifest',
]);

/** Tags whose `src`/`href` should be treated as a top level navigation. */
const NAVIGATION_TAGS = new Set(['a', 'area', 'form', 'iframe', 'frame']);

const ATTRIBUTE_RE = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
const TAG_RE = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;

/** Rewrite `url(...)` references inside a stylesheet. */
export function rewriteCss(css, context) {
  if (!css) return css;
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, value) => {
      const resolved = resolveUrl(value, context.baseUrl);
      if (!resolved) return match;
      return `url(${quote}${context.toRaw(resolved)}${quote})`;
    })
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (match, quote, value) => {
      const resolved = resolveUrl(value, context.baseUrl);
      if (!resolved) return match;
      return `@import ${quote}${context.toRaw(resolved)}${quote}`;
    });
}

/** Rewrite a `srcset` attribute value. */
export function rewriteSrcset(value, context) {
  if (!value) return value;
  return value
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return candidate;
      const parts = trimmed.split(/\s+/);
      const resolved = resolveUrl(parts[0], context.baseUrl);
      if (!resolved) return candidate;
      parts[0] = context.toRaw(resolved);
      return parts.join(' ');
    })
    .join(', ');
}

/**
 * Rewrite every URL inside an HTML document so that it is loaded through the
 * proxy again. `context` provides `baseUrl`, `toBrowse(url)` and
 * `toRaw(url)`.
 */
export function rewriteHtml(html, context) {
  if (!html) return html;

  let output = html;

  // 1. Resolve the effective base URL from a <base> element and drop the tag.
  let baseUrl = context.baseUrl;
  const baseTagMatch = output.match(/<base\b[^>]*>/i);
  if (baseTagMatch) {
    const hrefMatch = baseTagMatch[0].match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (hrefMatch) {
      const href = hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4];
      const resolved = resolveUrl(href, baseUrl);
      if (resolved) baseUrl = resolved;
    }
    output = output.replace(baseTagMatch[0], '');
  }

  const scopedContext = { ...context, baseUrl };

  // 2. Rewrite URL bearing attributes.
  output = output.replace(TAG_RE, (tagMatch, tagName, attributeString) => {
    const tag = tagName.toLowerCase();
    if (tag === 'base') return '';

    const rewrittenAttributes = attributeString.replace(
      ATTRIBUTE_RE,
      (attrMatch, attrName, rawValue, doubleQuoted, singleQuoted, unquoted) => {
        const name = attrName.toLowerCase();
        const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';

        if (name === 'srcset' || name === 'imagesrcset') {
          const replaced = rewriteSrcset(value, scopedContext);
          return `${attrName}=${quoteAttribute(replaced)}`;
        }

        if (name === 'style') {
          const replaced = rewriteCss(value, scopedContext);
          return `${attrName}=${quoteAttribute(replaced)}`;
        }

        if (name === 'content' && tag === 'meta') {
          return `${attrName}=${quoteAttribute(rewriteMetaContent(value, scopedContext))}`;
        }

        if (!URL_ATTRIBUTES.has(name)) {
          return attrMatch;
        }

        const resolved = resolveUrl(value, scopedContext.baseUrl);
        if (!resolved) return attrMatch;

        const target = NAVIGATION_TAGS.has(tag) ? scopedContext.toBrowse : scopedContext.toRaw;
        return `${attrName}=${quoteAttribute(target(resolved))}`;
      },
    );

    return `<${tagName}${rewrittenAttributes}>`;
  });

  // 3. Rewrite inline stylesheets.
  output = output.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (match, attributes, css) => {
    return `<style${attributes}>${rewriteCss(css, scopedContext)}</style>`;
  });

  // 4. Rewrite static navigations performed by inline scripts.
  output = rewriteInlineScripts(output);

  return output;
}

function quoteAttribute(value) {
  return `"${String(value).replace(/"/g, '&quot;')}"`;
}

/** Handle `<meta http-equiv="refresh" content="0; url=...">`. */
function rewriteMetaContent(value, context) {
  const match = String(value).match(/^(\s*[\d.]+\s*;\s*url\s*=\s*)(["']?)([^"';]+)\2(\s*)$/i);
  if (!match) return value;
  const resolved = resolveUrl(match[3], context.baseUrl);
  if (!resolved) return value;
  return `${match[1]}${quoteAttribute(context.toBrowse(resolved))}${match[4]}`;
}

/**
 * Rewrite inline scripts that assign a static URL to `location`, so that
 * in-page navigation stays inside the proxy.
 */
export function rewriteInlineScripts(html) {
  return html.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attributes, script) => {
      const rewritten = script.replace(
        /(?<![.\w$])((?:window|document|self|top|parent)\s*\.\s*)?location\s*(?:\.\s*href)?\s*=(?!=)\s*(["'])([^"'\n]*)\2/g,
        (assignMatch, prefix, quote, value) => {
          if (!/^https?:\/\//i.test(value) && !value.startsWith('/')) return assignMatch;
          return `window.__proxyGo(${quote}${value}${quote})`;
        },
      );
      return `<script${attributes}>${rewritten}</script>`;
    },
  );
}

/**
 * Insert a script tag as the first child of `<head>` so that it runs before
 * any of the proxied page's own scripts.
 */
export function injectIntoHead(html, script) {
  const tag = `<script>${script}</script>`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}${tag}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${tag}</head>`);
  }
  return `${tag}${html}`;
}

/**
 * The bootstrap script injected into every proxied page. It patches the
 * navigation APIs so that links opened from JavaScript stay proxied.
 */
export function buildNavigationScript(prefix) {
  return `(function(){
  var PREFIX=${JSON.stringify(prefix)};
  function encode(value){
    try{
      var bytes=new TextEncoder().encode(value);var binary='';
      for(var i=0;i<bytes.length;i+=32768){binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+32768));}
      return btoa(binary).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
    }catch(e){return '';}
  }
  function proxied(value){
    if(typeof value!=='string'||!value)return null;
    try{
      var abs=new URL(value,document.baseURI).href;
      if(abs.indexOf('http')!==0)return null;
      return PREFIX+encode(abs);
    }catch(e){return null;}
  }
  window.__proxyGo=function(value){
    var target=proxied(value);
    window.location.href=target||value;
  };
  if(window.Location&&Location.prototype){
    var _assign=Location.prototype.assign;
    var _replace=Location.prototype.replace;
    Location.prototype.assign=function(value){
      var target=proxied(value);
      if(target){window.location.href=target;return;}
      return _assign.call(this,value);
    };
    Location.prototype.replace=function(value){
      var target=proxied(value);
      if(target){window.location.href=target;return;}
      return _replace.call(this,value);
    };
  }
  var _open=window.open;
  window.open=function(url){
    var target=proxied(url);
    return _open.call(window,target||url,arguments[1],arguments[2]);
  };
  var _push=history.pushState;
  var _replaceState=history.replaceState;
  history.pushState=function(state,title,url){
    if(url){var target=proxied(url);if(target)return _push.call(history,state,title,target);}
    return _push.apply(history,arguments);
  };
  history.replaceState=function(state,title,url){
    if(url){var target=proxied(url);if(target)return _replaceState.call(history,state,title,target);}
    return _replaceState.apply(history,arguments);
  };
})();`;
}
