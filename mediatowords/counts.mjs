const events = new Set(['start', 'link_ok', 'link_failed', 'fallback','user_cancel','download_timeout','headers_timeout','media_headers','decode_start','model_start','recognize_start','decode_failed','model_failed','recognize_failed', 'complete', 'failed', 'copy', 'txt', 'srt']);
export async function recordCount(request, db) {
  const reply = status => new Response(null, {status, headers: {'Cache-Control':'no-store'}});
  if (request.method !== 'POST') return reply(405);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply(403);
  if (request.headers.get('sec-gpc') === '1' || request.headers.get('dnt') === '1') return reply(204);
  // The path carries only fixed labels. No body, cookies or referrer are needed.
  const [, , page, mode, event, ...extra] = new URL(request.url).pathname.split('/');
  if (extra.length || !['home','instagram'].includes(page) || !['link','file'].includes(mode) || !events.has(event)) return reply(400);
  await db.prepare("INSERT INTO daily_counts VALUES(date('now'),?,?,?,1) ON CONFLICT(day,page,mode,event) DO UPDATE SET total=total+1").bind(page,mode,event).run();
  return reply(204);
}
