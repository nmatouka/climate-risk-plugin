# Climateshed CMIP6 Proxy

A tiny Cloudflare Worker that lets the **client-side** Climate Risk extension reach
the private CMIP6 microservice (`ca-climate-cmip6.fly.dev`) without shipping the
upstream API key.

## What it does

```
Extension  ──GET /climate?lat=&lon=──►  Worker  ──/point/all (X-API-Key)──►  microservice
                                          │
                                          ├─ injects the API key (server-side secret)
                                          ├─ returns only climate, slr, and nri
                                          ├─ allows CORS for chrome-extension:// + localhost only
                                          ├─ limits each client IP to 30 requests a minute
                                          └─ caches each ~1 km point for 24 h at the edge
```

The extension never sees the key, and the edge cache shields the small upstream
VM (512 MB, hard limit 10 concurrent) from Web-Store-scale traffic.

## Deploy

1. Install Wrangler 4.36.0 or later (needed for the rate limiting binding) and log in:
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
   `https://climateshed-cmip6-proxy.<your-subdomain>.workers.dev/climate`, and
   list the same origin in `host_permissions` in `manifest.json`.

## Endpoint

`GET /climate?lat=<−90..90>&lon=<−180..180>` → `{"climate": …, "slr": …, "nri": …}`,
the three upstream `/point/all` fields the extension reads (scenario fixed to
`ssp370`; each is `null` when unavailable). Returns `400` for bad coordinates,
`429` when a client exceeds its limit, `502` if the upstream is unreachable or
returns invalid JSON, and passes through upstream `4xx/5xx` status codes (without
the upstream body).

If the extension starts reading another `/point/all` field, add it to
`RESPONSE_FIELDS` in `worker.js` and bump `CACHE_VERSION`.

## Abuse protection

- **Only the needed fields leave the Worker**, so the rest of the dataset can't be
  copied through it.
- **Rate limiting**: the `RATE_LIMITER` binding in `wrangler.toml` allows 30
  requests a minute per client IP. Cloudflare counts per location and
  approximately, so treat it as a brake on bulk copying rather than an exact quota.
- **CORS** lets only the extension and localhost read responses in a browser, so
  other websites can't use the proxy from their pages. Scripts outside a browser
  ignore CORS, which is why the limit and the field list matter.
- **Edge caching** keeps repeat lookups of a point off the upstream VM.
