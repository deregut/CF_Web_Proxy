# CF_Web_Proxy

## Overview

CF_Web_Proxy is a web proxy built on the Cloudflare network. It encodes a
target URL into a compact token and lets you **download**, **stream**, **browse**
or **raw-fetch** the result �?without the origin ever seeing your real IP
address.

The project runs entirely on Cloudflare Pages Functions: there is no server,
no database and no build step.

## Note for Iranian Users

Iranian users, please use this URL to access the service with half bandwidth (Nim baha): [edge05.66065.ir.cdn.ir](http://edge05.66065.ir.cdn.ir)

## Features

- **Download** �?fetches a file through the proxy with full HTTP `Range`
  support, so downloads can be paused and resumed.
- **Watch** �?streams media (video, audio, images) through the proxy.
- **Browse** �?renders a complete web page with every link, image, stylesheet
  and form rewritten to stay inside the proxy.
- **Raw** �?raw passthrough for images, CSS, JavaScript, fonts and other
  binary assets.
- **API** �?JSON/text passthrough with CORS support.
- **Blocklist** �?blocks whole domains (including sub-domains) from being
  proxied.
- **Access key** �?optional shared secret that turns the proxy into a private
  one.
- **SSRF protection** �?loopback, link-local, private and cloud-metadata
  addresses are rejected, and every redirect hop is validated.
- **URL encoding** �?URLs are encoded as UTF-8 safe base64url tokens, so
  non-ASCII URLs and query strings survive the round trip.

## Endpoints

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

Every endpoint except `/` and `/health` takes a `data` parameter containing the
base64url encoded target. The `/proxy` page generates those links for you.

## Installation

- [Installation for Cloudflare Pages (recommended)](installation-pages.md)
- [Installation for Cloudflare Workers](installation-worker.md)

## Configuration

All of these are optional and can be set in the Cloudflare dashboard under
**Settings �?Environment variables**, or in `wrangler.toml`.

| Variable | Purpose |
| --- | --- |
| `ACCESS_KEY` | Require `?key=...` (or the `X-Access-Key` header) before anything is proxied. |
| `BLACKLIST_URL` | URL of your own blocklist file. |
| `BLACKLIST` | KV namespace binding holding the blocklist under the key `blacklist`. |
| `MEDIA_PROXY_BASE` | Serve `/download` and `/watch` from another host (e.g. a CDN). |
| `CORS_ORIGIN` | Value of `Access-Control-Allow-Origin` for `/api`. Defaults to `*`. |
| `SELF_HOSTS` | Comma separated list of extra hostnames that must not be proxied. |
| `TARGET_HOST_ALLOWLIST` | **Local development only.** Comma separated list of hosts that may be proxied even though they are private (`localhost`, `127.0.0.1`). |

### Blocking domains

Add one domain per line to [`functions/blacklist.txt`](functions/blacklist.txt).
Sub-domains are matched as well. The list is fetched from GitHub raw and
cached for five minutes; if GitHub is unreachable the built-in fallback list is
used instead, so blocking never silently stops working.

## Usage

- **Download content** �?open `/proxy?url=<target>` and press *Download*.
  The download can be paused and resumed.
- **Watch content** �?press *Watch* to stream. A stable connection is
  recommended; MP4 works best.
- **Browse a page** �?press *Open page* to browse the target site with all
  links rewritten. A banner at the top shows the real origin and offers the
  download links.
- **Call an API** �?`/api?data=<token>` returns the upstream body unchanged
  and adds permissive CORS headers.

## Security notes

- Targets are validated before every request: only `http`/`https` is allowed
  and loopback, link-local, private, carrier-grade NAT and cloud-metadata
  addresses are rejected. Redirect hops are validated individually, so an
  allowed URL cannot bounce the worker to an internal address.
- Proxying your own deployment is blocked, which prevents recursive requests.
- The visitor's `Cookie` and `Authorization` headers are never relayed to the
  target site, and upstream `Set-Cookie` headers have their `Domain` attribute
  removed so they can only be set on the proxy host.
- All values rendered into HTML are escaped, and the `Content-Disposition`
  file name is sanitised according to RFC 6266.
- A public proxy is an open relay. Set `ACCESS_KEY` if your deployment is
  reachable by anyone else.

## Contributing

We welcome contributions! Please follow these steps to contribute:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Make your changes and commit them (`git commit -m 'Add new feature'`).
4. Push to the branch (`git push origin feature-branch`).
5. Open a Pull Request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgements

- Thanks to the Cloudflare team for their robust platform.
- Special thanks to [geek-spot](https://github.com/geek-spot) for their invaluable help with this code.

## Contact

For any questions or feedback, please open an issue or contact the repository owner.
