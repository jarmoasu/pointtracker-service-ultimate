'use strict';

// Fetches a Nimenhuuto event page server-side (browsers can't do this directly —
// nimenhuuto.com sends no CORS headers) and scrapes the public "In"/"Out"
// signup names out of the HTML. Nothing is persisted; this is a pure pass-through
// for the team-draw page's "import from Nimenhuuto" step.

const ALLOWED_HOST_SUFFIX = '.nimenhuuto.com';
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 3 * 1024 * 1024; // 3 MB is generous for an event page

function isAllowedNimenhuutoUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'nimenhuuto.com') return true;
  return host.endsWith(ALLOWED_HOST_SUFFIX);
}

// Slice out the HTML between a zone's opening marker and the next
// drop-zone div (its natural boundary in Nimenhuuto's markup).
function sliceZone(html, startMarker) {
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return '';
  const nextZoneIdx = html.indexOf('class="drop-zone', startIdx + startMarker.length);
  return html.slice(startIdx, nextZoneIdx === -1 ? html.length : nextZoneIdx);
}

function extractPlayers(zoneHtml) {
  const re = /id="player_(\d+)">([\s\S]*?)<\/span>/g;
  const out = [];
  let m;
  while ((m = re.exec(zoneHtml))) {
    const name = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (name) out.push({ nimenhuutoId: m[1], name });
  }
  return out;
}

async function nimenhuutoRoutes(fastify) {
  fastify.get('/api/nimenhuuto/players', {
    config: {
      rateLimit: { max: 20, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    const { url } = request.query;

    if (!url || !isAllowedNimenhuutoUrl(url)) {
      return reply.code(400).send({ error: 'Anna kelvollinen nimenhuuto.com-tapahtuman URL.' });
    }

    let res;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PointTrackerTeamDraw/1.0)' },
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return reply.code(502).send({ error: 'Nimenhuuto-sivun hakeminen epäonnistui.' });
    }

    if (!res.ok) {
      return reply.code(502).send({ error: `Nimenhuuto vastasi virheellä (${res.status}).` });
    }

    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return reply.code(502).send({ error: 'Sivu on odotettua suurempi.' });
    }

    const html = await res.text();

    const inPlayers = extractPlayers(sliceZone(html, 'id="zone_1"'));
    const outPlayers = extractPlayers(sliceZone(html, 'id="zone_2"'));

    reply.header('Cache-Control', 'no-store');
    return { in: inPlayers, out: outPlayers };
  });
}

module.exports = nimenhuutoRoutes;
