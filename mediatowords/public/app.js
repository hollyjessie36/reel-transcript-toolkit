function countAction(event, inputMode = mode) {
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  const page = location.pathname === '/' ? 'home' : 'instagram';
  fetch('/count/' + page + '/' + inputMode + '/' + event, {
    method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true
  }).catch(() => {});
}
const $=id=>document.getElementById(id);let mode='link',rows=[];
const isHome=location.pathname==='/';
const isTikTok=location.pathname==='/tiktok-transcript';
const linkPlatforms=new Set(isTikTok?[]:['instagram']);
const platformNames={instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube'};
function linkPlatform(value){
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
    if(/^(www\.)?instagram\.com$/.test(u.hostname)&&/^\/(reel|p)\/[\w-]{1,32}\/?$/.test(u.pathname))return 'instagram';
    if(/^(www\.|vm\.|vt\.)?tiktok\.com$/.test(u.hostname))return 'tiktok';
    if(/^(www\.|m\.)?youtube\.com$/.test(u.hostname)||u.hostname==='youtu.be')return 'youtube';
  }catch{}
  return '';
}
function canonical(){
  const value=$('url').value.trim(), platform=linkPlatform(value);
  if(!linkPlatforms.has(platform))return '';
  const u=new URL(value);
  return platform==='instagram'?u.origin+u.pathname:value;
}
function validate(){
  const value=$('url').value.trim(), platform=linkPlatform(value);
  const error=!value?'':platform&&!linkPlatforms.has(platform)?
    platformNames[platform]+' links are unavailable. Upload a saved video instead.':
    canonical()?'':'Enter a supported public video link.';
  const captions = isHome && platform === 'youtube' && linkPlatforms.has(platform) && mode === 'link';
  if (isHome) $('lang').closest('.settings').hidden = captions;
  $('processingNote').textContent = captions
    ? 'We send the video ID to TranscriptAPI to retrieve existing YouTube captions.'
    : 'Our server retrieves the public video. Speech recognition runs in your browser; the first run downloads a speech model.';
  $('url').setCustomValidity(error);
  $('hint').className=error?'error':'';
  $('hint').textContent=error||(platform?platformNames[platform]+' link detected.':
    'Public video links: '+[...linkPlatforms].map(name=>platformNames[name]).join(', ')+'.');
}
function switchMode(m){mode=m;if(isHome)$('lang').closest('.settings').hidden=false;let l=m==='link';$('run').textContent=l?(isHome||isTikTok)?'Transcribe video':'Transcribe Reel':'Transcribe file';$('processingNote').textContent=l?'Our server retrieves the public video. Speech recognition runs in your browser; the first run downloads a speech model.':'Your file stays on your device. A speech model downloads on first use. Keep this tab open while it processes.';$('url').hidden=!l;$('file').hidden=l;$('url').required=l;$('url').disabled=!l;$('file').required=!l;$('linkTab').setAttribute('aria-pressed',l);$('fileTab').setAttribute('aria-pressed',!l);$('label').htmlFor=l?'url':'file';$('label').textContent=l?(isHome?'Public video URL':isTikTok?'Public TikTok video URL':'Public Instagram link'):'Audio or video file';$('hint').className='';if(isHome){$('homeMode').textContent=l?'Upload a video instead':'Paste a link instead';$('url').placeholder=linkPlatforms.size>1?'Paste a public video URL':'Paste a public Instagram video URL';}if(l)validate();else $('hint').textContent='Choose one audio or video file, up to 250 MiB.'}
$('linkTab').onclick=()=>switchMode('link');$('fileTab').onclick=()=>switchMode('file');$('url').oninput=validate;
function stamp(t,full=false){const ms=Math.max(0,Math.round(t*1000));return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,'0')).join(':')+(full?','+String(ms%1000).padStart(3,'0'):'')}
function status(t,b=false){if($('run').disabled)$('hint').textContent=t;$('status').className=b?'error':'';$('status').textContent=t}

const maxMediaBytes = 250 * 1024 * 1024;
function sizeLimitMessage(type) {
  if (type.startsWith('video/')) {
    return 'This video exceeds 250 MiB. Export its audio track, then choose Upload file to transcribe the same speech.';
  }
  return 'This file exceeds 250 MiB. Split the recording into shorter parts and transcribe one at a time.';
}
let resultMode;

async function fetchReel(url) {
  const controller = new AbortController();
  let timeout;
  let size = 0;
  let receivedHeaders = false;
  const started = performance.now();
  const cancel = $('cancelFetch');
  cancel.hidden = false;
  let cause = 'idle';
  const platform=platformNames[linkPlatform(url)]||'Instagram';
  cancel.onclick = () => { cause = 'cancel'; controller.abort(); };
  const deadline = setTimeout(() => { cause = 'deadline'; controller.abort(); }, 120000);
  const paint = () => {
    const seconds = Math.floor((performance.now() - started) / 1000);
    status(receivedHeaders ? 'Downloading video: ' + (size / 1048576).toFixed(1) + ' MiB · ' + seconds + ' s' : 'Contacting ' + platform + '… ' + seconds + ' s');
  };
  paint();
  const timer = setInterval(paint, 1000);
  function resetTimeout() {
    clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(), receivedHeaders || platform === 'Instagram' ? 45000 : 95000);
  }
  resetTimeout();
  try {
    const response = await fetch('/media', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({url}), cache: 'no-store', signal: controller.signal
    });
    receivedHeaders = true;
    if (response.ok) countAction('media_headers');
    if (!response.ok) throw new Error(await response.text() || 'The platform could not return this video.');
    const tooLarge = sizeLimitMessage('video/mp4');
    if (Number(response.headers.get('content-length')) > maxMediaBytes) {
      controller.abort();
      throw new Error(tooLarge);
    }
    const chunks = [];

    const reader = response.body.getReader();
    while (true) {
      resetTimeout();
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxMediaBytes) {
        controller.abort();
        throw new Error(tooLarge);
      }
      chunks.push(value);
    }
    return new Blob(chunks, {type: response.headers.get('content-type') || 'video/mp4'});
  } catch (error) {
    if (controller.signal.aborted && error.name === 'AbortError') {
      countAction(cause === 'cancel' ? 'user_cancel' : receivedHeaders ? 'download_timeout' : 'headers_timeout');
      throw new Error(cause === 'cancel' ? 'Download cancelled. Retry the link or choose a saved video.' : platform + ' took too long to deliver the video. Retry or choose a saved video.');
    }
    throw error;
  } finally {
    cancel.hidden = true;
    cancel.onclick = null;
    clearInterval(timer);
    clearTimeout(deadline);
    clearTimeout(timeout);
  }
}
switchMode('link');
if(isHome){
 $('homeMode').onclick=()=>{if($('run').disabled)return;switchMode(mode==='link'?'file':'link');$(mode==='link'?'url':'file').focus();};
 fetch('/media-capabilities',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
   for(const name of data?.platforms||[])if(Object.hasOwn(platformNames,name))linkPlatforms.add(name);
   $('linkPlatforms').textContent='Public links: '+[...linkPlatforms].map(name=>platformNames[name]).join(' · ');
   if(mode==='link' && !$('run').disabled) switchMode('link');
 }).catch(()=>{});
}

function renderRows(){
 for(const [i,r] of rows.entries()){
 const p=document.createElement('p'),t=document.createElement('time'),s=document.createElement('textarea');
 t.textContent=stamp(r.start);s.value=r.text;s.rows=2;s.setAttribute('aria-label','Transcript line '+(i+1)+' at '+stamp(r.start));
 s.oninput=()=>{r.text=s.value.trim()};p.append(t,s);$('lines').append(p);
 }
}

let recognizer, playbackUrl;
const nonSpeechOnly = /^(?:\s*(?:\[(?:music|applause|laughter|silence|noise)\]|\((?:music|applause|laughter|silence|noise)\)|[♪♫♬]+)[.\s]*)+$/i;
document.querySelector('form').onsubmit=async e=>{
 e.preventDefault();countAction('start');const url=canonical();let media=$('file').files[0];
 if($('retryCaptions')) $('retryCaptions').hidden=true;
 $('result').hidden=false;$('example').hidden=true;$('retryFile').hidden=true;let fetchingLink=false;let stage='input';
 rows=[];$('lines').replaceChildren();$('actions').hidden=true;$('review').hidden=true;$('modelProgress').hidden=true;if(playbackUrl){URL.revokeObjectURL(playbackUrl);playbackUrl=null;}$('sourcePlayback').removeAttribute('src');$('sourcePlayback').load();
 for(const id of ['run','url','file','linkTab','fileTab','lang'])$(id).disabled=true;
 try{
 if(mode==='link' && linkPlatform(url)==='youtube'){
   fetchingLink=true;
   status('Retrieving YouTube captions…');
   const fallback='Could not retrieve captions right now. Retry or upload a saved video.';
   let response, data;
   try {
     response=await fetch('/media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(35000)});
     data=await response.json();
   } catch {
     $('retryCaptions').hidden=false;
     throw new Error(fallback);
   }
   if(!response.ok || !Array.isArray(data.rows) || !data.rows.length){
     $('retryCaptions').hidden=data.retry===false;
     throw new Error(data.message || fallback);
   }
   rows=data.rows;
   renderRows();
   $('actions').hidden=false;
   resultMode='link';
   countAction('link_ok');countAction('complete');
   status('YouTube captions ready. Edit a line below, then copy or download.');
   return;
 }
 if(mode==='link'){
 fetchingLink=true;status('Fetching the public video…');
 media=await fetchReel(url);fetchingLink=false;countAction('link_ok');
 } if (!media || !media.size) throw new Error('Choose an audio or video file that contains a recording.');
 if (media.size > maxMediaBytes) throw new Error(sizeLimitMessage(media.type));
 stage='decode';countAction('decode_start');
 status('Transcribing on this device · Reading audio…');
 const ctx=new AudioContext({sampleRate:16000});let pcm;
 try{let audio;try{audio=await ctx.decodeAudioData(await media.arrayBuffer())}catch(err){if(err.name==='EncodingError')throw new Error('Could not read an audio track from this file. It may have no sound or use an unsupported audio codec. Check that the video plays with audible speech, then try an MP3 or WAV export.');throw err}pcm=new Float32Array(audio.length);for(let c=0;c<audio.numberOfChannels;c++){const part=audio.getChannelData(c);for(let i=0;i<pcm.length;i++)pcm[i]+=part[i]/audio.numberOfChannels}}finally{await ctx.close()}
 stage='model';countAction('model_start');
 status('Preparing speech recognition. The first run downloads the model to your browser…');
 const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
 env.remoteHost=location.origin+'/models/';
 env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
 recognizer ||= await pipeline('automatic-speech-recognition','Xenova/whisper-tiny',{quantized:true,progress_callback:info=>{
   if(info.status==='progress' && Number.isFinite(info.progress)){
     $('modelProgress').hidden=false;$('modelProgress').value=info.progress;
     status('Downloading speech model file: '+Math.round(info.progress)+'% · '+(info.loaded/1048576).toFixed(1)+' MiB received. First use can take a few minutes.');
   }else if(info.status==='done'){status('Preparing downloaded speech model…');$('modelProgress').hidden=true;}
 }});
 $('modelProgress').hidden=true;
 stage='recognize';countAction('recognize_start');
 const duration = stamp(pcm.length / 16000);
 status('Transcribing ' + duration + ' of audio on this device. Keep this tab open.');
 const result=await recognizer(pcm,{...($('lang').value?{language:$('lang').value,task:'transcribe'}:{}),return_timestamps:true,chunk_length_s:30,stride_length_s:5});
 rows=(result.chunks||[])
   .map(x=>({start:x.timestamp[0],end:x.timestamp[1]??pcm.length/16000,text:x.text.trim()}))
   .filter(row=>row.text && !nonSpeechOnly.test(row.text));
 if(!rows.length)throw Error('Audio loaded, but no clear speech was recognized. Try a clip with clear speech, or select its spoken language and retry.');
 renderRows();
 playbackUrl=URL.createObjectURL(media);$('sourcePlayback').src=playbackUrl;$('review').hidden=false;
 $('coverage').textContent='Recording length: '+duration+' · Last recognized speech ends at '+stamp(rows[rows.length-1].end)+'.';
 $('actions').hidden=false;resultMode=mode;countAction('complete');status('Complete · Transcribed on this device');
 }catch(err){if(!fetchingLink && stage!=='input')countAction(stage+'_failed');countAction(fetchingLink?'link_failed':'failed');status(/array buffer allocation|out of memory|OrtRun.*error code = 6/i.test(err.message)?'Speech recognition could not finish on this device. Close unused tabs, reload, and try again. If it persists, try a device with more available memory.':err.message,true);$('retryFile').hidden=!fetchingLink}
 finally{$('modelProgress').hidden=true;for(const id of ['run','url','file','linkTab','fileTab','lang'])$(id).disabled=false;switchMode(mode);if(rows.length)$('hint').textContent='Transcript ready. Copy the text or download it below.'}
};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(rows.map(r=>r.text).join('\n'));countAction('copy',resultMode);$('copy').textContent='Copied';setTimeout(()=>$('copy').textContent='Copy text',1500)}catch{status('Clipboard unavailable. Use Download TXT.',true)}};
for(const ext of ['txt','srt'])$(ext).onclick=()=>{const value=rows.map((r,i)=>ext==='txt'?'['+stamp(r.start)+'] '+r.text:(i+1)+'\n'+stamp(r.start,true)+' --> '+stamp(r.end,true)+'\n'+r.text).join(ext==='txt'?'\n':'\n\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([value+'\n'],{type:'text/plain;charset=utf-8'}));a.download=(resultMode==='link'?'video-transcript':'transcript')+'.'+ext;a.click();countAction(ext,resultMode);setTimeout(()=>URL.revokeObjectURL(a.href),1000)};


(()=>{const ctx=document.modelContext||navigator.modelContext;if(!ctx?.registerTool)return;const abort=new AbortController();ctx.registerTool({name:'lookup_guide',description:'::TASK{list or read Media to Words guides; cite source_url}',inputSchema:{type:'object',properties:{id:{type:'string',maxLength:100}},additionalProperties:false},execute:async({id})=>{if(id!==undefined&&!/^[a-z0-9-]{1,100}$/.test(id))return {error:'Unknown guide'};return await(await fetch('/api/guides'+(id===undefined?'':'/'+id))).json()}},{signal:abort.signal});addEventListener('pagehide',e=>{if(!e.persisted)abort.abort()},{once:true})})();

if ($('retryCaptions')) $('retryCaptions').onclick=()=>document.querySelector('form').requestSubmit();
$('retryFile').onclick=()=>{countAction('fallback');switchMode('file');$('result').hidden=true;$('file').focus()};

// The sample uses the same exported formats as a completed transcription.
const sampleText=$('sampleOutput').textContent, sampleSrt=$('sampleSrt').content.textContent;
function showSample(srt){$('sampleOutput').textContent=srt?sampleSrt:sampleText;$('sampleTextTab').setAttribute('aria-pressed',!srt);$('sampleSrtTab').setAttribute('aria-pressed',srt)}
$('sampleTextTab').onclick=()=>showSample(false);$('sampleSrtTab').onclick=()=>showSample(true);
$('sampleCopy').onclick=async()=>{try{if(!sampleText)throw Error();await navigator.clipboard.writeText(sampleText);$('sampleStatus').textContent='Sample text copied.'}catch{$('sampleStatus').textContent='Use Download TXT to save the sample.'}};
