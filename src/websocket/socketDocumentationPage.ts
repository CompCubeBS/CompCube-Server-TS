/** Returns the self-contained AsyncAPI viewer served at /docs/ws. */
export function socketDocumentationPage(): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CompCube Socket.IO API</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#090a0f;color:#f3f4f7}*{box-sizing:border-box}body{margin:0}header,main{width:min(1100px,calc(100% - 2rem));margin:auto}header{padding:3rem 0 2rem;border-bottom:1px solid #292c37}h1{margin:0 0 .5rem;font-size:clamp(2rem,5vw,4rem)}p{color:#a9abb6}.links{display:flex;gap:1rem}.links a{color:#7ca7ff}.grid{display:grid;gap:.75rem;padding:2rem 0 5rem}.event{padding:1rem;border:1px solid #292c37;border-radius:.5rem;background:#11131a}.top{display:flex;align-items:center;justify-content:space-between;gap:1rem}.name{font:700 1rem ui-monospace,monospace}.direction{padding:.2rem .5rem;border-radius:99px;background:#20232d;color:#c9cbd2;font-size:.72rem}.client-to-server{color:#ff8ca0}.server-to-client{color:#78a8ff}pre{overflow:auto;padding:1rem;margin:1rem 0 0;background:#090a0f;border-radius:.35rem;color:#d6d7dd;font-size:.78rem}button{border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;width:100%}
</style>
</head>
<body><header><h1>CompCube Socket.IO API</h1><p>Raw JSON packets, typed acknowledgements and server broadcasts.</p><div class="links"><a href="/socket-docs.json">AsyncAPI JSON</a><a href="/docs">REST API</a></div></header><main><div id="events" class="grid"><p>Loading socket contract…</p></div></main>
<script>
fetch('/socket-docs.json').then(r=>r.json()).then(doc=>{const root=document.querySelector('#events');root.innerHTML='';for(const [name,event] of Object.entries(doc.channels)){const article=document.createElement('article');article.className='event';const button=document.createElement('button');button.innerHTML='<span class="top"><span class="name '+event.direction+'">'+name+'</span><span class="direction">'+event.direction+'</span></span>';const pre=document.createElement('pre');pre.hidden=true;pre.textContent=JSON.stringify(event,null,2);button.onclick=()=>pre.hidden=!pre.hidden;article.append(button,pre);root.append(article)}}).catch(()=>{document.querySelector('#events').innerHTML='<p>Socket documentation could not be loaded.</p>'});
</script></body></html>`;
}
