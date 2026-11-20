export function videoSource(value) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname;
  const path = url.pathname;
  if (['instagram.com', 'www.instagram.com'].includes(host) && /^\/(reel|p)\/[\w-]{1,32}\/?$/.test(path)) {
    return { platform: 'instagram', url: url.origin + path };
  }
  if (['tiktok.com', 'www.tiktok.com'].includes(host) && /^\/@[\w.-]+\/video\/\d{10,25}\/?$/.test(path)) {
    return { platform: 'tiktok', url: 'https://www.tiktok.com' + path };
  }
  if (['vm.tiktok.com', 'vt.tiktok.com'].includes(host) && /^\/[\w-]{4,32}\/?$/.test(path)) {
    return { platform: 'tiktok', url: url.origin + path };
  }
  const youtube = ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host);
  const id = host === 'youtu.be' ? path.match(/^\/([\w-]{11})\/?$/)?.[1]
    : youtube && (path === '/watch' ? url.searchParams.get('v') : path.match(/^\/(?:shorts|live)\/([\w-]{11})\/?$/)?.[1]);
  return id && /^[\w-]{11}$/.test(id) ? { platform: 'youtube', url: 'https://www.youtube.com/watch?v=' + id } : null;
}

export function enabledPlatforms(env) {
  const platforms = ['instagram'];
  if (env.VIDEO_RESOLVER_TOKEN && /^https:\/\//.test(env.VIDEO_RESOLVER_URL || '')) {
    const configured = (env.VIDEO_RESOLVER_PLATFORMS || '').split(',').map(value => value.trim());
    if (configured.includes('tiktok')) platforms.push('tiktok');
  }
  if (env.TRANSCRIPTAPI_KEY) platforms.push('youtube');
  return platforms;
}

export async function resolveVideo(source, env) {
  const response = await fetch(env.VIDEO_RESOLVER_URL, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(90000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.VIDEO_RESOLVER_TOKEN },
    body: JSON.stringify(source)
  });
  if (!response.ok && response.status !== 422 && response.status !== 429) {
    console.warn('Video resolver HTTP status:', response.status);
  }
  const type = response.headers.get('content-type')?.split(';')[0];
  if (response.ok && ['audio/mpeg', 'audio/mp4', 'audio/wav', 'video/mp4'].includes(type)) {
    return new Response(response.body, { headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store' } });
  }
  await response.body?.cancel();
  const status = response.status === 429 ? 429 : response.status === 422 ? 422 : 502;
  return new Response('Could not retrieve media from this public link. Try uploading the saved video.', {
    status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain;charset=utf-8' }
  });
}
