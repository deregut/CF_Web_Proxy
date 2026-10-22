# Installation for Cloudflare Workers

> **Recommendation:** use the [Cloudflare Pages installation](installation-pages.md).
> Pages maps `functions/<name>.js` to a route automatically, which means one
> less file to maintain. This guide is for people who specifically need a
> Worker.

## Prerequisites

- A Cloudflare account
- Node.js 18 or newer (only for the Wrangler CLI)

## Steps

1. **Get the code**

   ```bash
   git clone https://github.com/MinitorMHS/CF_Web_Proxy.git
   cd CF_Web_Proxy
   npm install
   ```

2. **Log in to Cloudflare**

   ```bash
   npx wrangler login
   ```

3. **Deploy**

   The Worker entry point lives in `worker.js` and its configuration in
   `wrangler.worker.toml`:

   ```bash
   npx wrangler deploy --config wrangler.worker.toml
   ```

4. **Test it locally first (optional)**

   ```bash
   npx wrangler dev --config wrangler.worker.toml
   ```

   The site is then available on <http://127.0.0.1:8787>.

## Routes

| Route | Methods | Description |
| --- | --- | --- |
| `/` | `GET` | Landing page with the URL form. |
| `/proxy` | `GET` | Builds the download / watch / browse / raw links for `?url=`. |
| `/download` | `GET`, `HEAD` | Downloads a file, supports `Range`. |
| `/watch` | `GET`, `HEAD` | Streams media; renders and rewrites HTML pages. |
| `/browse` | `GET`, `POST`, `HEAD` | Browses a full web page, forwards forms. |
| `/raw` | `GET`, `HEAD` | Raw passthrough for binary assets. |
| `/api` | any | JSON/text passthrough with CORS. |
| `/health` | `GET` | Status endpoint for uptime checks. |

## Notes

- There is no `index.html` for a Worker either: `worker.js` routes `/` to the
  same handler that Pages uses (`functions/index.js`).
- `wrangler.worker.toml` is separate from `wrangler.toml` because
  `pages_build_output_dir` is a Pages-only key and would fail validation for
  a Worker.
- Environment variables can also be set in the dashboard under
  **Settings → Variables and Secrets** of the Worker.
