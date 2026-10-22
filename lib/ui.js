/**
 * Shared HTML shell for the function rendered pages.
 */

const BASE_CSS = `
  :root {
    --bg-a: #ffecd2;
    --bg-b: #fcb69f;
    --surface: #ffffff;
    --text: #232323;
    --muted: #6b6b6b;
    --primary: #007bff;
    --primary-dark: #0056b3;
    --border: #e3e3e3;
    --success: #1e7b1e;
    --watch: #3b6a8a;
    --radius: 16px;
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 32px 16px 96px;
    color: var(--text);
    background-color: var(--bg-a);
    background-image: linear-gradient(to right, var(--bg-a), var(--bg-b));
    background-attachment: fixed;
  }
  .card {
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
    padding: 24px;
    width: 100%;
    max-width: 680px;
  }
  h1 { margin: 0 0 8px; font-size: 1.6rem; }
  h2 { margin: 0 0 12px; font-size: 1.15rem; }
  p { line-height: 1.55; }
  a { color: var(--primary); }
  form {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  input[type="text"], input[type="url"] {
    flex: 1 1 320px;
    min-width: 0;
    padding: 12px 12px 12px 40px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 1rem;
    background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%236b6b6b" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"/></svg>') no-repeat 11px center;
    background-size: 18px 18px;
  }
  button, .button {
    padding: 12px 22px;
    background-color: var(--primary);
    color: #fff;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font-size: 1rem;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background-color .2s ease, transform .2s ease;
  }
  button:hover, .button:hover { background-color: var(--primary-dark); transform: translateY(-1px); }
  .button-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
  .button.green { background: var(--success); }
  .button.green:hover { background: #165f16; }
  .button.blue { background: var(--watch); }
  .button.blue:hover { background: #2f5570; }
  .button.ghost { background: #ececec; color: #232323; }
  .button.ghost:hover { background: #dcdcdc; }
  .link-box {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0;
    padding: 10px 12px;
    background: #f6f6f6;
    border: 1px solid var(--border);
    border-radius: 10px;
    word-break: break-all;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: .85rem;
  }
  .link-box .url { flex: 1; min-width: 0; }
  .copy {
    background: none;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 4px 10px;
    font-size: .75rem;
    border-radius: 8px;
    white-space: nowrap;
  }
  .copy:hover { background: #e6e6e6; }
  .muted { color: var(--muted); font-size: .9rem; }
  .tag {
    display: inline-block;
    background: #eef4ff;
    color: #14509e;
    border-radius: 999px;
    padding: 3px 12px;
    font-size: .75rem;
    font-weight: 600;
    letter-spacing: .02em;
  }
  .error {
    background: #fff1f0;
    border: 1px solid #ffccc7;
    color: #a8071a;
    padding: 14px 16px;
    border-radius: 12px;
  }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  footer {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    text-align: center;
    padding: 10px;
    background: rgba(0, 0, 0, 0.08);
    border-top: 1px solid var(--border);
    font-size: .85rem;
  }
  @media (max-width: 600px) {
    body { padding: 20px 12px 90px; }
    form { flex-direction: column; }
    .button { width: 100%; }
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg-a: #1b1b1f;
      --bg-b: #2b2b33;
      --surface: #24242b;
      --text: #f2f2f2;
      --muted: #a8a8b3;
      --border: #3a3a45;
    }
    .link-box { background: #1c1c22; }
    .button.ghost { background: #33333d; color: #f2f2f2; }
    .copy { color: #a8a8b3; }
    .tag { background: #1d2b40; color: #9fc6ff; }
    footer { background: rgba(0, 0, 0, 0.35); }
  }
`;

/**
 * Render a full HTML document.
 */
export function renderPage({ title, description = '', body, head = '', script = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="referrer" content="no-referrer">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>">
<style>${BASE_CSS}</style>
${head}
</head>
<body>
${body}
${script}
</body>
</html>`;
}

/** Small helper that renders a copy-to-clipboard button for a URL. */
export function copyButton(targetId) {
  return `<button class="copy" type="button" data-copy="${targetId}" aria-label="Copy link">Copy</button>`;
}

export const COPY_SCRIPT = `
document.addEventListener('click', function (event) {
  var button = event.target.closest('[data-copy]');
  if (!button) return;
  var target = document.getElementById(button.getAttribute('data-copy'));
  if (!target) return;
  var value = target.getAttribute('data-value') || target.textContent.trim();
  var done = function () {
    var original = button.textContent;
    button.textContent = 'Copied';
    setTimeout(function () { button.textContent = original; }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(done, function () {});
  } else {
    var helper = document.createElement('textarea');
    helper.value = value;
    document.body.appendChild(helper);
    helper.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(helper);
  }
});`;
