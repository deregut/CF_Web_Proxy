# CF_Web_Proxy

## Overview

CF_Web_Proxy is a web proxy built on the Cloudflare network. It encodes a target URL into a compact token and lets you download, stream, browse, or raw-fetch the result without the origin server ever seeing your real IP address.

The project runs entirely on Cloudflare Pages Functions. There is no server, no database, and no build step.

## Note for Iranian Users

Iranian users may use this URL to access the service with reduced bandwidth:
[edge05.66065.ir.cdn.ir](http://edge05.66065.ir.cdn.ir)

## Features

- Download: fetches a file through the proxy with full HTTP `Range` support, so downloads can be paused and resumed.
- Watch: streams media (video, audio, images) through the proxy.
- Browse: renders a complete web page with every link, image, stylesheet, and form rewritten to stay inside the proxy.
- Raw: raw passthrough for images, CSS, JavaScript, fonts, and other binary assets.
- API: JSON/text passthrough with CORS support.
- Blocklist: blocks whole domains (including sub-domains) from being proxied.
- Access key: optional shared secret that turns the proxy into a private one.
- SSRF protection: loopback, link-local, private, and cloud-metadata addresses are rejected, and every redirect hop is validated.
- URL encoding: URLs are encoded as UTF-8-safe base64url tokens, so non-ASCII URLs and query strings survive the round trip.

## Endpoints

| Route | Methods | Description |
| --- | --- | --- |
| `/` | `GET` | Landing page with the URL form. |
| `/proxy` | `GET` | Builds the download / watch / browse / raw links for `?url=`. |
| `/download` | `GET`, `HEAD` | Downloads a file and supports `Range`. |
| `/watch` | `GET`, `HEAD` | Streams media and rewrites HTML pages. |
| `/browse` | `GET`, `POST`, `HEAD` | Browses a full web page and forwards forms. |
| `/raw` | `GET`, `HEAD` | Raw passthrough for binary assets. |
| `/api` | any | JSON/text passthrough with CORS support. |
| `/health` | `GET` | Status endpoint for uptime checks. |

Every endpoint except `/` and `/health` takes a `data` parameter containing the base64url-encoded target. The `/proxy` page generates those links for you.

## Access Key

This project supports an optional shared secret called `ACCESS_KEY`.

When `ACCESS_KEY` is configured, proxied requests require either:

- `?key=YOUR_KEY` in the URL, or
- the `X-Access-Key: YOUR_KEY` HTTP header

Examples:

```bash
https://your-domain.example/proxy?url=https://example.com/file.mp4&key=YOUR_KEY
