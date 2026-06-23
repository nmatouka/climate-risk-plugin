# Climateshed CMIP6 Proxy

A tiny Cloudflare Worker that lets the **client-side** Climate Risk extension reach
the private CMIP6 microservice (`ca-climate-cmip6.fly.dev`) without shipping the
upstream API key.

## What it does

```
Extension  ──GET /climate?lat=&lon=──►  Worker  ──/point/all (X-API-Key)──►  microservice
                                          │
                                          ├─ injects the API key (server-side secret)
                                          ├─ adds CORS for chrome-extension:// + localhost
                                          └─ caches each ~1 km point for 24 h at the edge
```

The extension never sees the key, and the edge cache shields the small upstream
VM (512 MB, hard limit 10 concurrent) from Web-Store-scale traffic.

## Deploy

1. Install Wrangler and log in:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Set the upstream API key as an encrypted secret (this is the microservice's
   `CMIP6_API_KEY`; never commit it):
   ```bash
   cd climate-proxy
   wrangler secret put CMIP6_API_KEY
   ```

3. Deploy:
   ```bash
   wrangler deploy
   ```

   Wrangler prints the public URL, e.g.
   `https://climateshed-cmip6-proxy.<your-subdomain>.workers.dev`.

4. Put that base URL into the extension: set `CLIMATE_PROXY_URL` in
   [`../utils/datafetcher.js`](../utils/datafetcher.js) to
   `https://climateshed-cmip6-proxy.<your-subdomain>.workers.dev/climate`.

   The extension's `manifest.json` already allows `https://*.workers.dev/*`; if you
   move the Worker to a custom domain, add that origin to `host_permissions` too.

## Endpoint

`GET /climate?lat=<−90..90>&lon=<−180..180>` → upstream `/point/all` JSON
(scenario fixed to `ssp370`). Returns `400` for bad coordinates, `502` if the
upstream is unreachable, and passes through upstream `4xx/5xx` status codes
(without the upstream body).

## Abuse protection

Caching is the primary defense. For hard limits, add a **Rate Limiting rule** in
the Cloudflare dashboard (Security → WAF → Rate limiting rules) scoped to this
Worker's route — no code change required.
