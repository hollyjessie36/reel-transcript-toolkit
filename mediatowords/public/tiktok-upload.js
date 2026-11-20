// Default to file mode until the live capability check completes.
switchMode('file');
countAction = () => {};
$('linkTab').disabled = true;
$('run').disabled = false;
const hintText = 'Choose a saved video file, up to 250 MiB.';
$('hint').textContent = hintText;
fetch('/media-capabilities', {cache: 'no-store'})
  .then(response => response.ok ? response.json() : null)
  .then(data => {
    if (!data?.platforms?.includes('tiktok')) return;
    linkPlatforms.add('tiktok');
    $('linkTab').disabled = false;
    $('linkTab').parentElement.hidden = false;
    if (!$('run').disabled && !$('file').files.length) switchMode('link');
  })
  .catch(() => {});
