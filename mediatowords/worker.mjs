import {redirectLegacyArticle} from './migration-redirects.mjs';
import {recordCount} from './counts.mjs';
import {youtubeCaptions} from './youtube-captions.mjs';
import {agent} from './agent.mjs';
import {videoSource, enabledPlatforms, resolveVideo} from './video-source.mjs';
export default {async fetch(req,env,ctx){const redirect=redirectLegacyArticle(req);if(redirect)return redirect;if(new URL(req.url).pathname.startsWith('/count/')) return recordCount(req,env.COUNTS);
 const discovery=await agent(req,env);if(discovery)return discovery;
 const path=new URL(req.url).pathname;
 if(path==='/media-capabilities' && req.method==='GET'){
   return Response.json({platforms:enabledPlatforms(env)},{headers:{'Cache-Control':'no-store'}});
 }
 const prefix='/models/Xenova/whisper-tiny/resolve/main/';
 if(path.startsWith(prefix)){
   const file=path.slice(prefix.length);
   const allowed=['config.json','tokenizer.json','tokenizer_config.json','preprocessor_config.json','generation_config.json','onnx/encoder_model_quantized.onnx','onnx/decoder_model_merged_quantized.onnx'];
   if(req.method!=='GET'||!allowed.includes(file))return new Response(null,{status:404});
   const remote=await fetch('https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/'+file);
   return new Response(remote.body,{status:remote.status,headers:{'Content-Type':file.endsWith('.json')?'application/json':'application/octet-stream','Cache-Control':'private, max-age=86400'}});
 }
 const origin=new URL(req.url).origin;
 const started=Date.now();
 function health(stage, outcome) {
   if(req.headers.get('sec-gpc')==='1'||req.headers.get('dnt')==='1')return;
   const elapsed=Date.now()-started;
   const bucket=elapsed<2000?'lt2s':elapsed<10000?'2to10s':'ge10s';
   ctx.waitUntil(env.COUNTS.prepare("INSERT INTO daily_counts VALUES(date('now'),'relay',?,?,1) ON CONFLICT(day,page,mode,event) DO UPDATE SET total=total+1").bind(stage,outcome+'_'+bucket).run().catch(()=>{}));
 }
 let stage='page';
 const reply=(s,t)=>new Response(t,{status:s,headers:{'Cache-Control':'no-store','Content-Type':'text/plain;charset=utf-8'}});
 if(new URL(req.url).pathname!='/media')return reply(404,'Not found.');
 if(req.method!=='POST'||req.headers.get('origin')!==origin||!req.headers.get('content-type')?.startsWith('application/json'))return reply(403,'Request not permitted.');
 try{
 if(Number(req.headers.get('content-length')||0)>2048)return reply(413,'Request too large.');
 const source=videoSource((await req.json()).url);
 if(!source)return reply(400,'Enter a public video URL.');
 if(source.platform!=='instagram'){
   if(!enabledPlatforms(env).includes(source.platform))return reply(422,'Link transcription is unavailable for this platform. Upload a saved video.');
   if(source.platform==='youtube') return youtubeCaptions(source.url, env.TRANSCRIPTAPI_KEY);
   try {
     return await resolveVideo(source,env);
   } catch (error) {
     console.warn('Video resolver request failed:', error.name, error.message);
     return reply(502,'Could not reach the video service. Try uploading the saved video.');
   }
 }
 const {url}=source;
 const options={redirect:'manual',cache:'no-store'};
 const code=new URL(url).pathname.split('/')[2];
 let video,lastStatus;
 for(const path of ['/reel/'+code+'/embed/captioned/',new URL(url).pathname,'/p/'+code+'/embed/']){
 try {
 const page=await fetch(new URL(path,'https://www.instagram.com'),{...options,signal:AbortSignal.timeout(8000),headers:{'X-IG-App-ID':'936619743392459','User-Agent':path.endsWith('/embed/captioned/')?'Twitterbot/1.0':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','Accept':'text/html,application/xhtml+xml','Accept-Language':'en-US,en;q=0.8'}});
 lastStatus=page.status;
 if(!page.ok){await page.body?.cancel();continue}
 const scripts=[];
 await new HTMLRewriter().on('meta[property="og:video"],meta[property="og:video:secure_url"],meta[property="og:video:url"],video[src]',{element(e){video ||= e.getAttribute('content')||e.getAttribute('src')}}).on('script',{text(t){scripts.push(t.text)}}).transform(page).arrayBuffer();
 if(!video){
 const raw=scripts.join('');
 for(const source of [raw,raw.replace(/\\"/g,'"').replace(/\\\\/g,'\\')]){
 const match=/"video_url"\s*:\s*("(?:\\.|[^"\\])*")/.exec(source);
 if(match){try{video=JSON.parse(match[1])}catch{}}
 if(video)break;
 }}
 if(video)break;
 } catch(error){health(stage,error.name==='TimeoutError'?'attempt_timeout':'attempt_error')}
 }
 if(!video)health(stage,'no_video');
 if(!video)return reply(422,'Instagram did not provide a public video from the Reel or its embed. The video may require login or Instagram may be blocking this request.');
 const u=new URL(video.replaceAll('\\/','/'));
 if(u.protocol!=='https:'||u.username||u.password||u.port||!/(^|\.)(facebook\.com|fbcdn\.net|instagram\.com|cdninstagram\.com)$/.test(u.hostname))return reply(422,'Unsupported media URL.');
 stage='cdn';
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),10000);
 let v;
 try { v=await fetch(u,{...options,signal:controller.signal}); } finally {clearTimeout(timer)}
 health(stage,v.ok && v.headers.get('content-type')?.startsWith('video/')?'headers_ok':'invalid_response');
 if(!v.ok||!v.headers.get('content-type')?.startsWith('video/'))return reply(502,'Instagram media HTTP '+v.status+'; no playable video returned.');
 return new Response(v.body,{headers:{'Content-Type':v.headers.get('content-type'),'Cache-Control':'private, no-store','X-Instagram-Page-Status':String(lastStatus),'X-Instagram-Media-Status':String(v.status)}});
 }catch(error){health(stage,error.name==='AbortError'?'timeout':'error');return reply(502,'Unable to retrieve this public video.')}
}};





