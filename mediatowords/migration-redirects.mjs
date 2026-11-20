// Consolidated legacy articles; serve a single permanent hop to the tool.
const legacyPaths = new Set([
  "/instagram-transcript-txt-vs-srt",
  "/instagram-transcript-missing-ending",
  "/instagram-transcript-correct-words",
  "/instagram-transcript-special-characters",
  "/instagram-transcript-link-format",
  "/instagram-transcript-subtitle-line-breaks",
  "/instagram-transcript-match-video",
  "/instagram-transcript-subtitles-after-intro"
]);
export function redirectLegacyArticle(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '').replace(/\.html$/, '');
  if (!legacyPaths.has(path)) return null;
  return new Response(null, {status: 301, headers: {
    Location: 'https://mediatowords.com/instagram-transcript',
    'Cache-Control': 'public, max-age=300'
  }});
}
