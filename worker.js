/* Scribae Tabula API: Cloudflare Worker + D1, built for the free plan.
   Passwords are stretched in the browser (scribae.js derive()); this Worker only stores a cheap hash of that result,
   which keeps it inside the free plan's CPU limit. Bindings: DB (D1). Secrets: SESSION_SECRET, SETUP_CODE. Var: ALLOWED_ORIGINS. */
const te=new TextEncoder(),td=new TextDecoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const b64=b=>{let s='';for(const x of new Uint8Array(b))s+=String.fromCharCode(x);return btoa(s)};
const b64u=b=>b64(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const rnd=n=>crypto.getRandomValues(new Uint8Array(n)),rhex=n=>hex(rnd(n));
const same=(a,b)=>{a=String(a);b=String(b);if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',te.encode(s)));
async function pbk(pw,salt){const k=await crypto.subtle.importKey('raw',te.encode(pw),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:te.encode(salt),iterations:10000},k,256))}
class HttpErr extends Error{constructor(s,m){super(m);this.s=s}}
const E=(s,m)=>{throw new HttpErr(s,m)};
const SC=['read','write','credits'],NAME=/^[\w.\-]{3,32}$/,PWH=/^[0-9a-f]{64}$/,ID=/^[a-f0-9]{8,32}$/;
const NAME_MSG='Username: 3-32 letters, numbers, . _ -',TOO='Too many attempts - try again in a few minutes';
const CH=300000,MAXC=1200000,QUOTA=20e6;
const SCHEMA=[
`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,salt TEXT,hash TEXT,role TEXT DEFAULT 'user',disabled INTEGER DEFAULT 0,tokens INTEGER DEFAULT 0,created INTEGER,last INTEGER DEFAULT 0,pwat INTEGER DEFAULT 0,prefs TEXT DEFAULT '{}',rcode TEXT,rexp INTEGER DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS files(uid TEXT,id TEXT,name TEXT,kind TEXT,updated INTEGER,size INTEGER,PRIMARY KEY(uid,id))`,
`CREATE TABLE IF NOT EXISTS chunks(uid TEXT,id TEXT,n INTEGER,data TEXT,PRIMARY KEY(uid,id,n))`,
`CREATE TABLE IF NOT EXISTS apikeys(id TEXT PRIMARY KEY,uid TEXT,name TEXT,hash TEXT,scopes TEXT,created INTEGER,last INTEGER DEFAULT 0,exp INTEGER DEFAULT 0,inbox TEXT)`,
`CREATE INDEX IF NOT EXISTS apikeys_uid ON apikeys(uid)`,
`CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT)`,
`CREATE TABLE IF NOT EXISTS fails(k TEXT PRIMARY KEY,n INTEGER,t INTEGER)`];
const ADMIN_SQL=`SELECT u.id,u.name,u.role,u.tokens,u.prefs,u.disabled,u.last,u.created,(SELECT COUNT(*) FROM files f WHERE f.uid=u.id) files,(SELECT COUNT(*) FROM apikeys k WHERE k.uid=u.id) keys,(SELECT COALESCE(SUM(size),0) FROM files f WHERE f.uid=u.id) bytes FROM users u ORDER BY u.created`;
const q=(env,sql,...a)=>env.DB.prepare(sql).bind(...a);
const initDb=env=>env.DB.batch(SCHEMA.map(s=>env.DB.prepare(s).bind()));
/* settings: open registration, credit grants, key delivery */
async function cfg(env){const r=await q(env,"SELECT v FROM settings WHERE k='cfg'").first(),c=r?JSON.parse(r.v):{};return{open:c.open!==false,grant:{amount:0,everyHours:0,last:0,...c.grant},keyPush:{everyDays:0,lifeDays:60,last:0,...c.keyPush}}}
const saveCfg=(env,c)=>q(env,"INSERT INTO settings(k,v) VALUES('cfg',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",JSON.stringify(c)).run();
/* login throttling, stored in D1 */
async function limited(env,k,n){const f=await q(env,'SELECT n,t FROM fails WHERE k=?',k).first();return !!f&&f.n>=n&&Date.now()-f.t<6e5}
async function bad(env,k){const now=Date.now();await q(env,'INSERT INTO fails(k,n,t) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN ?-t<600000 THEN n+1 ELSE 1 END,t=?',k,now,now,now).run()}
/* sessions (signed, 30 days) and inbox encryption */
const hk=env=>crypto.subtle.importKey('raw',te.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const sign=async(env,s)=>b64u(await crypto.subtle.sign('HMAC',await hk(env),te.encode(s)));
const token=async(env,u)=>{const b=b64u(te.encode(JSON.stringify({u:u.id,e:Date.now()+30*864e5,i:Date.now()})));return b+'.'+await sign(env,b)};
const ek=async env=>crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',te.encode(env.SESSION_SECRET+'|inbox')),'AES-GCM',false,['encrypt','decrypt']);
const enc=async(env,s)=>{const iv=rnd(12);return b64(iv)+'.'+b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await ek(env),te.encode(s)))};
const dec=async(env,s)=>{const[i,c]=s.split('.');return td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(i)},await ek(env),unb64(c)))};
async function who(env,req){const t=(req.headers.get('Authorization')||'').slice(7);
if(t.startsWith('scr_')){const uid=t.slice(4,20),kid=t.slice(20,28),k=await q(env,'SELECT * FROM apikeys WHERE id=? AND uid=?',kid,uid).first();if(!k||(k.exp&&k.exp<Date.now())||!same(await sha(t.slice(28)),k.hash))return null;const u=await q(env,'SELECT * FROM users WHERE id=?',uid).first();if(!u||u.disabled)return null;if(Date.now()-k.last>36e5)await q(env,'UPDATE apikeys SET last=? WHERE id=?',Date.now(),kid).run();return{u,scopes:JSON.parse(k.scopes)}}
const[b,s]=t.split('.');if(!b||!s||!same(s,await sign(env,b)))return null;let p;try{p=JSON.parse(td.decode(unb64(b)))}catch(e){return null}
const u=await q(env,'SELECT * FROM users WHERE id=?',String(p.u)).first();return u&&!u.disabled&&p.e>Date.now()&&p.i>=u.pwat?{u,scopes:null}:null}
/* users and keys */
const pub=u=>({id:u.id,name:u.name,role:u.role,tokens:u.tokens,prefs:JSON.parse(u.prefs||'{}')});
const getUser=(env,id)=>q(env,'SELECT * FROM users WHERE id=?',id).first();
const needPw=b=>{const pw=String(b.pw||'');if(!PWH.test(pw))E(400,'Please reload the page and try again');return pw};
async function mkUser(env,name,pw,role){const id=rhex(8),salt=rhex(16);try{await q(env,'INSERT INTO users(id,name,salt,hash,role,created) VALUES(?,?,?,?,?,?)',id,name,salt,await pbk(pw,salt),role,Date.now()).run()}catch(e){if(/UNIQUE/i.test(String(e.message)))E(409,'That username is taken');throw e}return id}
async function mkKey(env,uid,name,scopes,days,deliver){const kid=rhex(4),sec=b64u(rnd(24)),key='scr_'+uid+kid+sec,now=Date.now();
await q(env,'INSERT INTO apikeys(id,uid,name,hash,scopes,created,exp,inbox) VALUES(?,?,?,?,?,?,?,?)',kid,uid,String(name||'Key').slice(0,60),await sha(sec),JSON.stringify(scopes),now,days>0?now+days*864e5:0,deliver?await enc(env,key):null).run();return{key,id:kid}}
async function pushKeys(env,c){const now=Date.now(),life=c.keyPush.lifeDays||60;await q(env,'DELETE FROM apikeys WHERE exp>0 AND exp<?',now).run();
for(const u of (await q(env,'SELECT id FROM users WHERE disabled=0').all()).results)await mkKey(env,u.id,'Delivered '+new Date(now).toISOString().slice(0,10),['read','write'],life,true)}
async function tick(env){const c=await cfg(env),now=Date.now();let ch=false;
if(c.grant.amount>0&&c.grant.everyHours>0&&now-c.grant.last>=c.grant.everyHours*36e5){await q(env,'UPDATE users SET tokens=tokens+? WHERE disabled=0',c.grant.amount).run();c.grant.last=now;ch=true}
if(c.keyPush.everyDays>0&&now-c.keyPush.last>=c.keyPush.everyDays*864e5){await pushKeys(env,c);c.keyPush.last=now;ch=true}
if(ch)await saveCfg(env,c)}
const corsH=(env,req)=>{const o=req.headers.get('Origin'),L=String(env.ALLOWED_ORIGINS||'*').split(',').map(s=>s.trim()).filter(Boolean);return{'Access-Control-Allow-Origin':L.includes('*')?'*':L.includes(o)?o:L[0],'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Max-Age':'86400',Vary:'Origin','X-Content-Type-Options':'nosniff'}};
const json=(h,s,o)=>new Response(JSON.stringify(o),{status:s,headers:{...h,'Content-Type':'application/json','Cache-Control':'no-store'}});
const body=async req=>{try{return await req.json()}catch(e){return{}}};
const ip=req=>req.headers.get('CF-Connecting-IP')||'0';
async function route(env,req,h){
const p=new URL(req.url).pathname,m=req.method;
if(m==='OPTIONS')return new Response(null,{status:204,headers:h});
if(!p.startsWith('/api/'))return json(h,404,{error:'Not found'});
if(!env.DB||!env.SESSION_SECRET)E(500,'Server not configured: missing the DB binding or the SESSION_SECRET secret');
if(+req.headers.get('content-length')>2e6)E(413,'Request too large');
if(p==='/api/ping'){let c;try{c=await q(env,'SELECT COUNT(*) c FROM users').first()}catch(e){await initDb(env);c={c:0}}return json(h,200,{ok:1,open:(await cfg(env)).open,setup:c.c===0})}
if(p==='/api/setup'&&m==='POST'){const a=ip(req);if(await limited(env,'s'+a,5))E(429,TOO);const b=await body(req),n=String(b.user||'').trim(),pw=needPw(b);
if((await q(env,'SELECT COUNT(*) c FROM users').first()).c>0)E(403,'Setup is already done');
if(!env.SETUP_CODE||!same(String(b.code||''),env.SETUP_CODE)){await bad(env,'s'+a);E(403,'Wrong setup code')}
if(!NAME.test(n))E(400,NAME_MSG);await mkUser(env,n,pw,'admin');return json(h,200,{ok:1})}
if(p==='/api/register'&&m==='POST'){if((await q(env,'SELECT COUNT(*) c FROM users').first()).c===0)E(403,'Not set up yet');if(!(await cfg(env)).open)E(403,'Registration is closed');
const a=ip(req);if(await limited(env,'r'+a,5))E(429,'Too many sign-ups from this address - try again later');await bad(env,'r'+a);
const b=await body(req),n=String(b.user||'').trim(),pw=needPw(b);if(!NAME.test(n))E(400,NAME_MSG);const u=await getUser(env,await mkUser(env,n,pw,'user'));return json(h,200,{token:await token(env,u),me:pub(u)})}
if(p==='/api/login'&&m==='POST'){const b=await body(req),a=ip(req),k=a+'|'+String(b.user).toLowerCase();if(await limited(env,k,8)||await limited(env,a,30))E(429,TOO);
const pw=String(b.pw||''),u=await q(env,'SELECT * FROM users WHERE name=?',String(b.user||'')).first(),hh=await pbk(pw,u?u.salt:'0'.repeat(32));
if(!u||!same(hh,u.hash)){await bad(env,k);await bad(env,a);E(401,'Wrong username or password')}if(u.disabled)E(403,'This account is disabled');
await q(env,'UPDATE users SET last=? WHERE id=?',Date.now(),u.id).run();return json(h,200,{token:await token(env,u),me:pub(u)})}
if(p==='/api/reset'&&m==='POST'){const b=await body(req),a=ip(req),k=a+'|'+String(b.user).toLowerCase();if(await limited(env,k,8)||await limited(env,a,30))E(429,TOO);
const pw=needPw(b),u=await q(env,'SELECT * FROM users WHERE name=?',String(b.user||'')).first();
if(!u||u.disabled||!u.rcode||u.rexp<Date.now()||!same(await sha(String(b.code||'')),u.rcode)){await bad(env,k);await bad(env,a);E(401,'That reset code is wrong or has expired')}
const salt=rhex(16),now=Date.now();await q(env,'UPDATE users SET salt=?,hash=?,rcode=NULL,rexp=0,pwat=?,last=? WHERE id=?',salt,await pbk(pw,salt),now,now,u.id).run();
const n=await getUser(env,u.id);return json(h,200,{token:await token(env,n),me:pub(n)})}
const au=await who(env,req);if(!au)E(401,'Please sign in');
const u=au.u,sc=au.scopes,need=s=>!sc||sc.includes(s);
if(sc&&(/^\/api\/(password|keys|inbox|admin)/.test(p)||(p==='/api/me'&&m==='PUT')))E(403,'This needs a signed-in session, not an API key');
if(sc&&((p.startsWith('/api/files')&&!need(m==='GET'?'read':'write'))||(p==='/api/credits/spend'&&!need('credits'))))E(403,'This key does not allow that');
if(p==='/api/me'){if(m==='PUT'){const b=await body(req),pr=b.prefs||{},c=JSON.parse(u.prefs||'{}');if(/^#[0-9a-f]{6}$/i.test(pr.ac||''))c.ac=pr.ac;if(['auto','light','dark'].includes(pr.theme))c.theme=pr.theme;await q(env,'UPDATE users SET prefs=? WHERE id=?',JSON.stringify(c),u.id).run();u.prefs=JSON.stringify(c)}return json(h,200,pub(u))}
if(p==='/api/password'&&m==='POST'){const b=await body(req),old=String(b.old||''),pw=needPw(b);if(!PWH.test(old)||!same(await pbk(old,u.salt),u.hash))E(403,'Current password is wrong');
const salt=rhex(16);await q(env,'UPDATE users SET salt=?,hash=?,pwat=? WHERE id=?',salt,await pbk(pw,salt),Date.now(),u.id).run();return json(h,200,{token:await token(env,await getUser(env,u.id))})}
if(p==='/api/keys'){if(m==='GET'){const r=(await q(env,'SELECT id,name,scopes,created,last,exp,inbox IS NOT NULL AS w FROM apikeys WHERE uid=? ORDER BY created',u.id).all()).results;
return json(h,200,{keys:r.map(x=>({id:x.id,name:x.name,scopes:JSON.parse(x.scopes),created:x.created,last:x.last,exp:x.exp})),inbox:r.filter(x=>x.w).map(x=>({id:x.id,created:x.created,exp:x.exp}))})}
if(m==='POST'){const b=await body(req),s=(Array.isArray(b.scopes)?b.scopes:[]).filter(x=>SC.includes(x));if(!s.length)E(400,'Pick at least one permission');
if((await q(env,'SELECT COUNT(*) c FROM apikeys WHERE uid=?',u.id).first()).c>=10)E(400,'You can have up to 10 keys - revoke one first');
return json(h,200,await mkKey(env,u.id,b.name,s,Math.max(0,Math.min(3650,Math.floor(+b.days||0)))))}}
const km=p.match(/^\/api\/keys\/([a-f0-9]{8})$/);if(km&&m==='DELETE'){await q(env,'DELETE FROM apikeys WHERE id=? AND uid=?',km[1],u.id).run();return json(h,200,{ok:1})}
if(p==='/api/inbox'&&m==='GET'){const o=[];for(const x of (await q(env,'SELECT id,created,exp,inbox FROM apikeys WHERE uid=? AND inbox IS NOT NULL',u.id).all()).results){try{o.push({id:x.id,key:await dec(env,x.inbox),created:x.created,exp:x.exp})}catch(e){}}return json(h,200,{keys:o})}
const im=p.match(/^\/api\/inbox\/([a-f0-9]{8})$/);if(im&&m==='DELETE'){await q(env,'UPDATE apikeys SET inbox=NULL WHERE id=? AND uid=?',im[1],u.id).run();return json(h,200,{ok:1})}
if(p==='/api/credits/spend'&&m==='POST'){const b=await body(req),n=Math.floor(+b.amount||0);if(n<1)E(400,'Amount must be 1 or more');
const r=await q(env,'UPDATE users SET tokens=tokens-? WHERE id=? AND tokens>=?',n,u.id,n).run();if(!r.meta.changes)E(402,'Not enough credits');return json(h,200,{tokens:(await getUser(env,u.id)).tokens})}
if(p==='/api/files'){
if(m==='GET')return json(h,200,{files:(await q(env,'SELECT id,name,kind,updated,size FROM files WHERE uid=? ORDER BY updated DESC',u.id).all()).results});
if(m==='POST'){const b=await body(req),name=String(b.name||'Untitled').slice(0,120),kind=b.kind==='doc'?'doc':'sheet',content=String(b.content||'');let id=b.id;if(id&&!ID.test(id))E(400,'Bad file id');if(!id)id=rhex(8);
if(content.length>MAXC)E(413,'This file is too large for the free plan (about 1.2 MB at most)');
const used=(await q(env,'SELECT COALESCE(SUM(size),0) s FROM files WHERE uid=? AND id!=?',u.id,id).first()).s;if(used+content.length>QUOTA)E(413,'Drive quota exceeded');
const parts=[];for(let i=0;i<content.length;){let e=Math.min(i+CH,content.length);const c=content.charCodeAt(e-1);if(e<content.length&&c>=0xD800&&c<=0xDBFF)e--;parts.push(content.slice(i,e));i=e}if(!parts.length)parts.push('');
const now=Date.now();await env.DB.batch([q(env,'DELETE FROM chunks WHERE uid=? AND id=?',u.id,id),...parts.map((c,i)=>q(env,'INSERT INTO chunks(uid,id,n,data) VALUES(?,?,?,?)',u.id,id,i,c)),
q(env,'INSERT INTO files(uid,id,name,kind,updated,size) VALUES(?,?,?,?,?,?) ON CONFLICT(uid,id) DO UPDATE SET name=excluded.name,kind=excluded.kind,updated=excluded.updated,size=excluded.size',u.id,id,name,kind,now,content.length)]);
return json(h,200,{id,name,kind,updated:now,size:content.length})}}
const fm=p.match(/^\/api\/files\/([a-f0-9]{8,32})$/);if(fm){const f=await q(env,'SELECT * FROM files WHERE uid=? AND id=?',u.id,fm[1]).first();if(!f)E(404,'No such file');
if(m==='DELETE'){await env.DB.batch([q(env,'DELETE FROM chunks WHERE uid=? AND id=?',u.id,f.id),q(env,'DELETE FROM files WHERE uid=? AND id=?',u.id,f.id)]);return json(h,200,{ok:1})}
const r=(await q(env,'SELECT data FROM chunks WHERE uid=? AND id=? ORDER BY n',u.id,f.id).all()).results;return json(h,200,{id:f.id,name:f.name,kind:f.kind,updated:f.updated,content:r.map(x=>x.data).join('')})}
if(p.startsWith('/api/admin/')){if(u.role!=='admin')E(403,'Admins only');
if(p==='/api/admin/users'&&m==='GET')return json(h,200,{users:(await q(env,ADMIN_SQL).all()).results.map(x=>({id:x.id,name:x.name,role:x.role,tokens:x.tokens,prefs:JSON.parse(x.prefs||'{}'),disabled:!!x.disabled,last:x.last,created:x.created,files:x.files,keys:x.keys,bytes:x.bytes}))});
if(p==='/api/admin/users'&&m==='POST'){const b=await body(req),n=String(b.name||'').trim(),pw=needPw(b);if(!NAME.test(n))E(400,NAME_MSG);await mkUser(env,n,pw,b.role==='admin'?'admin':'user');return json(h,200,{ok:1})}
if(p==='/api/admin/settings'){if(m==='PUT'){const b=await body(req),g=b.grant||{},kp=b.keyPush||{},c=await cfg(env),now=Date.now();c.open=!!b.open;
c.grant={amount:Math.max(0,Math.floor(+g.amount||0)),everyHours:Math.max(0,+g.everyHours||0),last:now};c.keyPush={everyDays:Math.max(0,+kp.everyDays||0),lifeDays:Math.max(1,+kp.lifeDays||60),last:now};await saveCfg(env,c)}return json(h,200,await cfg(env))}
if(p==='/api/admin/grant'&&m==='POST'){const b=await body(req),n=Math.max(0,Math.floor(+b.amount||0));if(b.id)await q(env,'UPDATE users SET tokens=tokens+? WHERE disabled=0 AND id=?',n,String(b.id)).run();else await q(env,'UPDATE users SET tokens=tokens+? WHERE disabled=0',n).run();return json(h,200,{ok:1})}
if(p==='/api/admin/push-keys'&&m==='POST'){const c=await cfg(env);await pushKeys(env,c);c.keyPush.last=Date.now();await saveCfg(env,c);return json(h,200,{ok:1})}
const am=p.match(/^\/api\/admin\/users\/([a-f0-9]{16})$/);if(am&&m==='POST'){const t=await getUser(env,am[1]);if(!t)E(404,'No such user');const b=await body(req),self=t.id===u.id,out={ok:1};
if(b.action==='reset'){const code=b64u(rnd(9)),now=Date.now();await q(env,"UPDATE users SET hash='!',rcode=?,rexp=?,pwat=? WHERE id=?",await sha(code),now+864e5,now,t.id).run();out.code=code}
else if(b.action==='disable'){if(self)E(400,'You cannot disable yourself');await q(env,'UPDATE users SET disabled=1-disabled WHERE id=?',t.id).run()}
else if(b.action==='role'){if(self)E(400,'You cannot change your own role');await q(env,"UPDATE users SET role=CASE role WHEN 'admin' THEN 'user' ELSE 'admin' END WHERE id=?",t.id).run()}
else if(b.action==='tokens')await q(env,'UPDATE users SET tokens=? WHERE id=?',Math.max(0,Math.floor(+b.value||0)),t.id).run();
else if(b.action==='revokekeys')await q(env,'DELETE FROM apikeys WHERE uid=?',t.id).run();
else if(b.action==='delete'){if(self)E(400,'You cannot delete yourself');await env.DB.batch([q(env,'DELETE FROM chunks WHERE uid=?',t.id),q(env,'DELETE FROM files WHERE uid=?',t.id),q(env,'DELETE FROM apikeys WHERE uid=?',t.id),q(env,'DELETE FROM users WHERE id=?',t.id)])}
else E(400,'Unknown action');return json(h,200,out)}}
return json(h,404,{error:'Not found'})}
export default{
async fetch(req,env){const h=corsH(env,req);try{return await route(env,req,h)}catch(e){if(e instanceof HttpErr)return json(h,e.s,{error:e.message});console.error(e);return json(h,500,{error:'Server error'})}},
async scheduled(ev,env,ctx){ctx.waitUntil(tick(env))}};
