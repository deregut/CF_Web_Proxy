# Installation for Cloudflare Pages

## Prerequisites

- A GitHub account
- A Cloudflare account

## Steps

1. **Fork the Repository**:
    - Go to the [CF_Web_Proxy repository](https://github.com/MinitorMHS/CF_Web_Proxy) on GitHub.
    - Click the "Fork" button in the top-right corner to create a copy of the repository in your GitHub account.

2. **Create a Cloudflare Account**:
    - If you don't already have a Cloudflare account, sign up at [Cloudflare](https://www.cloudflare.com/).

3. **Create a New Pages Project**:
    - Log in to your Cloudflare account.
    - Navigate to the **Workers & Pages** section.
    - Click on **Pages** and then **Create a project**.
    - Select **Connect to GitHub** and authorize Cloudflare to access your GitHub account.

4. **Link the Repository**:
    - Choose the forked repository from your GitHub account.
    - Click on **Begin setup**.

5. **Configure the build settings**:
    - **Framework preset**: `None`
    - **Build command**: leave empty (or `exit 0`)
    - **Build directory / output directory**: `public`

    The output directory matters. The repository root also contains
    `README.md`, `LICENSE` and the `functions/` sources; pointing the build at
    `public` keeps them out of the public site. The same value is already
    declared in `wrangler.toml` (`pages_build_output_dir = "./public"`).

6. **Configure and Deploy**:
    - Follow the prompts to configure your Pages project.
    - Click on **Save and Deploy** to deploy your project.

Your Cloudflare web proxy should now be set up and running.

## Where is the web page?

There is no `index.html` in the repository root, and that is intentional.
In a Cloudflare Pages project the `functions/` directory is mapped to routes
file by file, so `functions/index.js` *is* the `/` route â€?it renders the
landing page. Pages matches a Function before it looks for a static asset, so
the landing page is served by the Function and never from a file.

The `public/` directory holds the static assets that Pages serves directly:
`robots.txt`, `favicon.svg`, the `_headers` file (extra response headers) and
the `_routes.json` file (which restricts Function invocations to the routes
this project actually uses, so everything else is served from the free static
tier).

## Optional: restrict the proxy with an access key

1. Go to **Settings â†?Environment variables**.
2. Add `ACCESS_KEY` with a secret value.
3. Redeploy.

Every request now needs `?key=YOUR_KEY` (or the `X-Access-Key` header).

## Optional: use your own blocklist

1. Edit `functions/blacklist.txt` in your fork.
2. Go to **Settings â†?Environment variables**.
3. Add `BLACKLIST_URL` pointing at the raw URL of *your* copy of the file, for
   example `https://raw.githubusercontent.com/<user>/<repo>/main/functions/blacklist.txt`.

## Optional: run it locally

```bash
npm install
npx wrangler pages dev public
```

The site is then available on <http://127.0.0.1:8788>.

To allow the proxy to reach a service running on your own machine during local
testing, create a `.dev.vars` file containing:

```
TARGET_HOST_ALLOWLIST=localhost,127.0.0.1
```

Never enable that flag on a public deployment.
