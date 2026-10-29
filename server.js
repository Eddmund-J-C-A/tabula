#!/usr/bin/env node
/* Scribae Tabula server: accounts, per-user Drive, admin console API, periodic token grants. Node 18+, no dependencies.
   Env: PORT, SCRIBAE_DATA, SCRIBAE_ORIGIN (allowed site origins, comma-separated, e.g. https://you.github.io), TRUST_PROXY=1 (when behind Caddy/nginx), SCRIBAE_QUOTA_MB, ADMIN_USER, ADMIN_PASS */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=+process.env.PORT||8787,ORIGINS=(process.env.SCRIBAE_ORIGIN||'*').split(',').map(s=>s.trim()).filter(Boolean),DATA=path.resolve(process.env.SCRIBAE_DATA||path.join(__dirname,'data')),QUOTA=(+process.env.SCRIBAE_QUOTA_MB||50)*1048576,MAXB=12e6;
fs.mkdirSync(path.join(DATA,'drive'),{recursive:true});
const F=n=>path.join(DATA,n),rb=(n,d)=>{try{return JSON.parse(fs.readFileSync(F(n),'utf8'))}catch(e){return d}},wb=(n,o)=>{fs.writeFileSync(F(n)+'.tmp',JSON.stringify(o));fs.renameSync(F(n)+'.tmp',F(n))};
let users=rb('users.json',{}),cfg=rb('settings.json',{open:true,grant:{amount:0,everyHours:0,last:Date.now()}}),key;
try{key=fs.readFileSync(F('secret.key'))}catch(e){key=crypto.randomBytes(32);fs.writeFileSync(F('secret.key'),key,{mode:0o600})}
cfg.keyPush=cfg.keyPush||{everyDays:0,lifeDays:60,last:Date.now()};
const sv=()=>wb('users.json',users),hash=(p,s)=>crypto.scryptSync(p,s,64).toString('hex');
const same=(a,b)=>{a=Buffer.from(a);b=Buffer.from(b);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
function mkUser(name,pass,role){const salt=crypto.randomBytes(16).toString('hex'),id=crypto.randomBytes(8).toString('hex');return users[id]={id,name,salt,hash:hash(pass,salt),role,disabled:false,tokens:0,created:Date.now(),last:0,pwAt:0,prefs:{}}}
const find=n=>Object.values(users).find(u=>u.name.toLowerCase()===String(n).toLowerCase());
if(!Object.keys(users).length){const n=process.env.ADMIN_USER||'admin',p=process.env.ADMIN_PASS||crypto.randomBytes(9).toString('base64url');mkUser(n,p,'admin');sv();console.log('First run: created admin "'+n+'" with password '+p+' - sign in and change it.')}
/* stateless signed session tokens (30 days); a password change or reset invalidates older ones */
const sign=s=>crypto.createHmac('sha256',key).update(s).digest('base64url');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),ek=crypto.createHash('sha256').update(key).update('inbox').digest(),SC=['read','write','credits'];
const enc=s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',ek,iv),b=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64')};
const dec=s=>{const b=Buffer.from(s,'base64'),d=crypto.createDecipheriv('aes-256-gcm',ek,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8')};
/* API keys: scr_<userId 16 hex><keyId 8 hex><secret 32 chars>; only a SHA-256 of the secret is stored */
function mkKey(u,name,scopes,days){const kid=crypto.randomBytes(4).toString('hex'),sec=crypto.randomBytes(24).toString('base64url');(u.keys=u.keys||[]).push({id:kid,name:String(name||'Key').slice(0,60),hash:sha(sec),scopes,created:Date.now(),last:0,exp:days>0?Date.now()+days*864e5:0});return{key:'scr_'+u.id+kid+sec,id:kid}}
function pushKeys(){const life=cfg.keyPush.lifeDays||60,now=Date.now(),day=new Date().toISOString().slice(0,10);Object.values(users).forEach(u=>{if(u.disabled)return;u.keys=(u.keys||[]).filter(k=>!k.exp||k.exp>now);u.inbox=(u.inbox||[]).filter(x=>x.exp>now);const r=mkKey(u,'Delivered '+day,['read','write'],life);u.inbox.push({id:r.id,enc:enc(r.key),created:now,exp:now+life*864e5})});cfg.keyPush.last=now}

const token=u=>{const b=Buffer.from(JSON.stringify({u:u.id,e:Date.now()+30*864e5,i:Date.now()})).toString('base64url');return b+'.'+sign(b)};
function who(req){const t=(req.headers.authorization||'').slice(7);
if(t.startsWith('scr_')){const u=users[t.slice(4,20)],k=u&&(u.keys||[]).find(x=>x.id===t.slice(20,28));if(!k||u.disabled||(k.exp&&k.exp<Date.now())||!same(sha(t.slice(28)),k.hash))return null;k.last=Date.now();req.key=k.scopes;return u}
const[b,s]=t.split('.');if(!b||!s||!same(s,sign(b)))return null;let p;try{p=JSON.parse(Buffer.from(b,'base64url'))}catch(e){return null}const u=users[p.u];return u&&!u.disabled&&p.e>Date.now()&&p.i>=(u.pwAt||0)?u:null}
const fails=new Map(),lim=(k,n=8)=>{const f=fails.get(k);return f&&f.n>=n&&Date.now()-f.t<6e5},bad=k=>{const f=fails.get(k),now=Date.now();fails.set(k,{n:f&&now-f.t<6e5?f.n+1:1,t:now})};
const ip=req=>process.env.TRUST_PROXY?((req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress):req.socket.remoteAddress;
const body=req=>new Promise((ok,no)=>{let n=0;const c=[];req.on('data',d=>{n+=d.length;if(n>MAXB){no(new Error('Request too large'));req.destroy()}else c.push(d)});req.on('end',()=>{try{ok(c.length?JSON.parse(Buffer.concat(c).toString()):{})}catch(e){no(new Error('Bad JSON'))}});req.on('error',no)});
const H={'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','X-Content-Type-Options':'nosniff'};
const hd=(res,x)=>({...H,'Access-Control-Allow-Origin':res.ao,Vary:'Origin',...x});
const send=(res,c,o)=>{res.writeHead(c,hd(res,{'Content-Type':'application/json','Cache-Control':'no-store'}));res.end(JSON.stringify(o))},err=(res,c,m)=>send(res,c,{error:m});
const pub=u=>({id:u.id,name:u.name,role:u.role,tokens:u.tokens,prefs:u.prefs||{}});
/* per-user Drive: data/drive/<userId>/<fileId>.json - paths come only from the authenticated user's id */
const dd=u=>{const d=path.join(DATA,'drive',u.id);fs.mkdirSync(d,{recursive:true});return d},okId=i=>/^[a-f0-9]{8,32}$/.test(i||'');
const rf=(u,id)=>{try{return JSON.parse(fs.readFileSync(path.join(dd(u),id+'.json'),'utf8'))}catch(e){return null}};
const files=u=>fs.readdirSync(dd(u)).filter(f=>f.endsWith('.json')).map(f=>{try{return JSON.parse(fs.readFileSync(path.join(dd(u),f),'utf8'))}catch(e){return null}}).filter(Boolean);
const bytes=u=>fs.readdirSync(dd(u)).reduce((n,f)=>n+fs.statSync(path.join(dd(u),f)).size,0);
const meta=f=>({id:f.id,name:f.name,kind:f.kind,updated:f.updated,size:f.content.length});
const MT={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
function stat(p,res){let f;try{f=path.join(__dirname,p==='/'?'index.html':decodeURIComponent(p))}catch(e){return err(res,400,'Bad path')}const e=path.extname(f);
if(!MT[e]||path.basename(f)==='server.js'||!f.startsWith(__dirname+path.sep)||f.startsWith(DATA+path.sep))return err(res,404,'Not found');
fs.readFile(f,(x,b)=>{if(x)return err(res,404,'Not found');res.writeHead(200,hd(res,{'Content-Type':MT[e]}));res.end(b)})}
http.createServer(async(req,res)=>{try{
const p=new URL(req.url,'http://x').pathname,m=req.method;
res.ao=ORIGINS.includes('*')?'*':ORIGINS.includes(req.headers.origin)?req.headers.origin:ORIGINS[0];
if(m==='OPTIONS'){res.writeHead(204,hd(res));return res.end()}
if(!p.startsWith('/api/'))return stat(p,res);
if(p==='/api/ping')return send(res,200,{ok:1,open:cfg.open});
if(p==='/api/register'&&m==='POST'){if(!cfg.open)return err(res,403,'Registration is closed');{const a=ip(req);if(lim('r'+a,5))return err(res,429,'Too many sign-ups from this address - try again later');bad('r'+a)}const b=await body(req),n=String(b.user||'').trim(),pw=String(b.pass||'');
if(!/^[\w.\-]{3,32}$/.test(n))return err(res,400,'Username: 3-32 letters, numbers, . _ -');if(pw.length<8||pw.length>200)return err(res,400,'Password must be 8+ characters');if(find(n))return err(res,409,'That username is taken');
const u=mkUser(n,pw,'user');u.last=Date.now();sv();return send(res,200,{token:token(u),me:pub(u)})}
if(p==='/api/login'&&m==='POST'){const b=await body(req),a=ip(req),k=a+'|'+String(b.user).toLowerCase();if(lim(k)||lim(a,30))return err(res,429,'Too many attempts - try again in a few minutes');
const u=find(b.user);if(!u||!same(hash(String(b.pass||''),u.salt),u.hash)){bad(k);bad(a);return err(res,401,'Wrong username or password')}if(u.disabled)return err(res,403,'This account is disabled');u.last=Date.now();sv();return send(res,200,{token:token(u),me:pub(u)})}
const u=who(req);if(!u)return err(res,401,'Please sign in');
const kk=req.key,need=s=>!kk||kk.includes(s);
if(kk&&(/^\/api\/(password|keys|inbox|admin)/.test(p)||(p==='/api/me'&&m==='PUT')))return err(res,403,'This needs a signed-in session, not an API key');
if(kk&&((p.startsWith('/api/files')&&!need(m==='GET'?'read':'write'))||(p==='/api/credits/spend'&&!need('credits'))))return err(res,403,'This key does not allow that');
if(p==='/api/me'){if(m==='PUT'){const b=await body(req),pr=b.prefs||{};if(/^#[0-9a-f]{6}$/i.test(pr.ac||''))u.prefs.ac=pr.ac;if(['auto','light','dark'].includes(pr.theme))u.prefs.theme=pr.theme;sv()}return send(res,200,pub(u))}
if(p==='/api/password'&&m==='POST'){const b=await body(req),pw=String(b.pass||'');if(!same(hash(String(b.old||''),u.salt),u.hash))return err(res,403,'Current password is wrong');if(pw.length<8||pw.length>200)return err(res,400,'Password must be 8+ characters');
u.salt=crypto.randomBytes(16).toString('hex');u.hash=hash(pw,u.salt);u.pwAt=Date.now();sv();return send(res,200,{token:token(u)})}
if(p==='/api/keys'){if(m==='GET')return send(res,200,{keys:(u.keys||[]).map(x=>({id:x.id,name:x.name,scopes:x.scopes,created:x.created,last:x.last,exp:x.exp})),inbox:(u.inbox||[]).map(x=>({id:x.id,created:x.created,exp:x.exp}))});
if(m==='POST'){const b=await body(req),sc=(Array.isArray(b.scopes)?b.scopes:[]).filter(x=>SC.includes(x));if(!sc.length)return err(res,400,'Pick at least one permission');if((u.keys||[]).length>=10)return err(res,400,'You can have up to 10 keys - revoke one first');const r=mkKey(u,b.name,sc,Math.max(0,Math.min(3650,Math.floor(+b.days||0))));sv();return send(res,200,r)}}
const km=p.match(/^\/api\/keys\/([a-f0-9]{8})$/);if(km&&m==='DELETE'){u.keys=(u.keys||[]).filter(x=>x.id!==km[1]);u.inbox=(u.inbox||[]).filter(x=>x.id!==km[1]);sv();return send(res,200,{ok:1})}
if(p==='/api/inbox'&&m==='GET')return send(res,200,{keys:(u.inbox||[]).map(x=>{try{return{id:x.id,key:dec(x.enc),created:x.created,exp:x.exp}}catch(e){return null}}).filter(Boolean)});
const im=p.match(/^\/api\/inbox\/([a-f0-9]{8})$/);if(im&&m==='DELETE'){u.inbox=(u.inbox||[]).filter(x=>x.id!==im[1]);sv();return send(res,200,{ok:1})}
if(p==='/api/credits/spend'&&m==='POST'){const b=await body(req),n=Math.floor(+b.amount||0);if(n<1)return err(res,400,'Amount must be 1 or more');if(u.tokens<n)return err(res,402,'Not enough credits');u.tokens-=n;sv();return send(res,200,{tokens:u.tokens})}
if(p==='/api/files'){if(m==='GET')return send(res,200,{files:files(u).map(meta).sort((a,b)=>b.updated-a.updated)});
if(m==='POST'){const b=await body(req),name=String(b.name||'Untitled').slice(0,120),kind=b.kind==='doc'?'doc':'sheet',content=String(b.content||'');let id=b.id;if(id&&!okId(id))return err(res,400,'Bad file id');if(!id)id=crypto.randomBytes(8).toString('hex');
const old=rf(u,id);if(bytes(u)-(old?JSON.stringify(old).length:0)+content.length>QUOTA)return err(res,413,'Drive quota exceeded');const f={id,name,kind,content,updated:Date.now()};fs.writeFileSync(path.join(dd(u),id+'.json'),JSON.stringify(f));return send(res,200,meta(f))}}
const fm=p.match(/^\/api\/files\/([a-f0-9]{8,32})$/);if(fm){const f=rf(u,fm[1]);if(!f)return err(res,404,'No such file');if(m==='DELETE'){fs.unlinkSync(path.join(dd(u),fm[1]+'.json'));return send(res,200,{ok:1})}return send(res,200,f)}
if(p.startsWith('/api/admin/')){if(u.role!=='admin')return err(res,403,'Admins only');
if(p==='/api/admin/users'&&m==='POST'){const b=await body(req),n=String(b.name||'').trim(),pw=String(b.pass||'');if(!/^[\w.\-]{3,32}$/.test(n))return err(res,400,'Username: 3-32 letters, numbers, . _ -');if(pw.length<8||pw.length>200)return err(res,400,'Password must be 8+ characters');if(find(n))return err(res,409,'That username is taken');mkUser(n,pw,b.role==='admin'?'admin':'user');sv();return send(res,200,{ok:1})}
if(p==='/api/admin/users'&&m==='GET')return send(res,200,{users:Object.values(users).map(x=>({...pub(x),disabled:x.disabled,last:x.last,created:x.created,files:files(x).length,keys:(x.keys||[]).length,bytes:bytes(x)}))});
if(p==='/api/admin/settings'){if(m==='PUT'){const b=await body(req),g=b.grant||{};cfg.open=!!b.open;cfg.grant.amount=Math.max(0,Math.floor(+g.amount||0));cfg.grant.everyHours=Math.max(0,+g.everyHours||0);cfg.grant.last=Date.now();const kp=b.keyPush||{};cfg.keyPush={everyDays:Math.max(0,+kp.everyDays||0),lifeDays:Math.max(1,+kp.lifeDays||60),last:Date.now()};wb('settings.json',cfg)}return send(res,200,cfg)}
if(p==='/api/admin/push-keys'&&m==='POST'){pushKeys();sv();wb('settings.json',cfg);return send(res,200,{ok:1})}
if(p==='/api/admin/grant'&&m==='POST'){const b=await body(req),n=Math.floor(+b.amount||0);Object.values(users).forEach(x=>{if(!x.disabled&&(!b.id||b.id===x.id))x.tokens+=n});sv();return send(res,200,{ok:1})}
const am=p.match(/^\/api\/admin\/users\/([a-f0-9]{16})$/);if(am&&m==='POST'){const t=users[am[1]],b=await body(req);if(!t)return err(res,404,'No such user');const self=t.id===u.id,out={ok:1};
if(b.action==='reset'){const tmp=crypto.randomBytes(9).toString('base64url');t.salt=crypto.randomBytes(16).toString('hex');t.hash=hash(tmp,t.salt);t.pwAt=Date.now();out.temp=tmp}
else if(b.action==='disable'){if(self)return err(res,400,'You cannot disable yourself');t.disabled=!t.disabled}
else if(b.action==='role'){if(self)return err(res,400,'You cannot change your own role');t.role=t.role==='admin'?'user':'admin'}
else if(b.action==='revokekeys'){t.keys=[];t.inbox=[]}
else if(b.action==='tokens')t.tokens=Math.max(0,Math.floor(+b.value||0));
else if(b.action==='delete'){if(self)return err(res,400,'You cannot delete yourself');delete users[t.id];fs.rmSync(path.join(DATA,'drive',t.id),{recursive:true,force:true})}
else return err(res,400,'Unknown action');sv();return send(res,200,out)}}
return err(res,404,'Not found')}catch(e){err(res,e.message==='Request too large'?413:400,e.message)}}).listen(PORT,()=>console.log('Scribae Tabula server: http://localhost:'+PORT));
/* periodic token grant: adds the configured amount to every active user each interval */
setInterval(()=>{const g=cfg.grant;if(g&&g.amount>0&&g.everyHours>0&&Date.now()-g.last>=g.everyHours*36e5){Object.values(users).forEach(u=>{if(!u.disabled)u.tokens+=g.amount});g.last=Date.now();sv();wb('settings.json',cfg)}
const kp=cfg.keyPush;if(kp.everyDays>0&&Date.now()-kp.last>=kp.everyDays*864e5){pushKeys();sv();wb('settings.json',cfg)}},6e4);
