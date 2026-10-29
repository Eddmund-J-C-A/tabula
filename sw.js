// Offline support: network-first, falls back to the cache. Works in any browser with service workers (install via "Add to Home Screen" / "Install").
const V='scribae-v1',SHELL=['./','tabula.html','docs.html','admin.html','scribae.js','config.js','manifest.webmanifest','icon.svg','xlsx.full.min.js','https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>c.add(new Request(u,u.startsWith('http')?{mode:'no-cors'}:{})).catch(()=>{})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).pathname.includes('/api/'))return;
e.respondWith(fetch(r).then(res=>{if(res.ok||res.type==='opaque'){const c=res.clone();caches.open(V).then(x=>x.put(r,c))}return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('tabula.html'))))});
// Offline support: network-first, falls back to the cache. Works in any browser with service workers (install via "Add to Home Screen" / "Install").
const V='scribae-v2',SHELL=['./','index.html','tabula.html','docs.html','admin.html','scribae.js','config.js','manifest.webmanifest','icon.svg','xlsx.full.min.js','https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>c.add(new Request(u,u.startsWith('http')?{mode:'no-cors'}:{})).catch(()=>{})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).pathname.includes('/api/'))return;
e.respondWith(fetch(r).then(res=>{if(res.ok||res.type==='opaque'){const c=res.clone();caches.open(V).then(x=>x.put(r,c))}return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('index.html'))))});
