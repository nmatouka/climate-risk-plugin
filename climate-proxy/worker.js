// ============================================================================
// Climateshed CMIP6 — proxy for the Climate Risk extension (Cloudflare Worker)
// ============================================================================
// The CMIP6 microservice (ca-climate-cmip6.fly.dev) requires an X-API-Key and
// defaults to deny-all CORS, so a client-side browser extension cannot call it
// directly without shipping a secret. This Worker:
//   • holds the API key server-side (Worker secret CMIP6_API_KEY)
//   • forwards GET /climate?lat=&lon=  →  upstream /point/all?scenario=ssp370
//   • asks upstream for, and returns, only the fields the extension reads
//     (climate, slr, nri) — the service skips the rest
//   • allows CORS only for chrome-extension:// (and localhost dev)
//   • limits requests per client IP (RATE_LIMITER binding in wrangler.toml)
//   • caches each point ~24h at the edge to shield the small upstream VM
//
// Deploy: see README.md. The extension calls ONLY this Worker — never the
// microservice directly — and never sees the API key.
// ============================================================================

const UPSTREAM = 'https://ca-climate-cmip6.fly.dev';
const SCENARIO = 'ssp370'; // LOCA2 CMIP6 high-emissions scenario (Climateshed default)
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h
// Part of the edge cache key. Bump it whenever the response shape changes, so
// copies cached in the old shape are never served.
const CACHE_VERSION = '2';
// The /point/all fields utils/datafetcher.js reads. These are both what the Worker
// asks upstream for and what it serves, so the service skips the other datasets
// instead of computing them for a response that would drop them.
const RESPONSE_FIELDS = ['climate', 'slr', 'nri'];

// Browsers may read responses only from the extension and local development.
// An extension page with host permission for this Worker isn't subject to CORS,
// so this keeps other websites out without depending on the extension's Origin.
function isAllowedOrigin(origin) {
  if (origin.startsWith('chrome-extension://')) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1');
  } catch (_) {
    return false;
  }
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

// Keep only RESPONSE_FIELDS from an upstream /point/all body. Throws on invalid JSON.
function pickFields(upstreamBody) {
  const all = JSON.parse(upstreamBody);
  const picked = {};
  for (const field of RESPONSE_FIELDS) picked[field] = all[field] ?? null;
  return JSON.stringify(picked);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/climate') {
      return json({ error: 'Not found' }, 404, cors);
    }

    // Looking at listings takes a few requests a minute; copying the dataset takes
    // thousands. Callers are anonymous, so the limit is per client IP. Cloudflare
    // applies it per location and approximately, which is enough to stop bulk copying.
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return json({ error: 'Too many requests' }, 429, { ...cors, 'Retry-After': '60' });
      }
    }

    const lat = parseFloat(url.searchParams.get('lat'));
    const lon = parseFloat(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return json({ error: 'lat and lon are required numeric query params' }, 400, cors);
    }

    if (!env.CMIP6_API_KEY) {
      return json({ error: 'Proxy misconfigured: missing upstream API key' }, 500, cors);
    }

    // Snap to ~0.01° (~1 km) to match the upstream cache grid and maximize hit rate.
    const sLat = lat.toFixed(2);
    const sLon = lon.toFixed(2);

    // Edge cache keyed on the snapped point. Stored without an origin-specific
    // CORS header so a HIT can be re-served to any allowed origin.
    const cacheKey = new Request(
      `${url.origin}/climate?lat=${sLat}&lon=${sLon}&scenario=${SCENARIO}&v=${CACHE_VERSION}`);
    const cache = caches.default;

    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      r.headers.set('X-Proxy-Cache', 'HIT');
      return r;
    }

    const upstreamUrl =
      `${UPSTREAM}/point/all?lat=${sLat}&lon=${sLon}&scenario=${SCENARIO}` +
      `&fields=${RESPONSE_FIELDS.join(',')}`;
    let upstreamResp;
    try {
      upstreamResp = await fetch(upstreamUrl, {
        headers: { 'X-API-Key': env.CMIP6_API_KEY, 'Accept': 'application/json' },
      });
    } catch (_) {
      return json({ error: 'Upstream unreachable' }, 502, cors);
    }

    const upstreamBody = await upstreamResp.text();
    if (!upstreamResp.ok) {
      // Pass through the status code but never the upstream body/headers (key safety).
      return json({ error: 'Upstream error', status: upstreamResp.status }, upstreamResp.status, cors);
    }

    let body;
    try {
      body = pickFields(upstreamBody);
    } catch (_) {
      return json({ error: 'Upstream returned invalid JSON' }, 502, cors);
    }

    // Cache a generic (CORS-free) copy; serve a CORS-tagged copy to the caller.
    const cacheable = new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheable));

    return new Response(body, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'X-Proxy-Cache': 'MISS',
      },
    });
  },
};
