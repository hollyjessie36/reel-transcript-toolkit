const messages = {
  no_captions: 'This video has no YouTube captions. Upload a saved video to transcribe its audio.',
  video_unavailable: 'This video is unavailable. Check the link or upload a saved video.',
  age_restricted: 'Captions are unavailable for this age-restricted video. You can upload a saved copy.',
  live_not_started: 'This stream has not started. Try again after it airs.'
};

export async function youtubeCaptions(url, key) {
  const reply = (data, status) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
  const temporary = () => reply({retry: true, message: 'Could not retrieve captions right now. Retry or upload a saved video.'}, 503);
  const endpoint = new URL('https://transcriptapi.com/api/v2/youtube/transcript');
  endpoint.search = new URLSearchParams({video_url: url, format: 'json', include_timestamp: 'true'});
  try {
    const response = await fetch(endpoint, {headers: {Authorization: 'Bearer ' + key}, redirect: 'error', signal: AbortSignal.timeout(30000)});
    const body = await response.json();
    if (response.status === 404 && Object.hasOwn(messages, body.code)) {
      return reply({message: messages[body.code], retry: false}, 422);
    }
    if (!response.ok || !Array.isArray(body.transcript) || !body.transcript.length) return temporary();
    const rows = [];
    for (const cue of body.transcript) {
      const {start, duration, text} = cue;
      if (typeof text !== 'string' || !Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration < 0) return temporary();
      if (text.trim()) rows.push({start, end: start + duration, text: text.trim()});
    }
    return rows.length ? reply({rows}, 200) : temporary();
  } catch {
    return temporary();
  }
}
