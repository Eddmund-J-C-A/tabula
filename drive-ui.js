/* Scribae file browser: folders, upload, download, preview, rename, move, delete.
   Used by the launcher (index.html) and the API Drive viewer (api-drive.html).
   DriveUI.mount(element, options) -> controller.  The Drive object it talks to is Scribae.drive or Scribae.cloudDrive(key). */
(() => {
'use strict';
const CSS = `
.dui{--f:#193a34;--g:#c49a55;--i:#23342f;--m:#66736b;--p:#fffdf7;text-align:left;color:var(--i);font-family:Georgia,"Times New Roman",serif}
.dui *{box-sizing:border-box}
.dui .dhead{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:12px}
.dui h2{margin:0;color:var(--f);font-size:1.65rem;font-weight:normal}
.dui .dtools,.dui .dacts,.dui .seg{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dui .dacts{margin-bottom:12px}
.dui .pill{font:600 .78rem Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#89672f;background:none;border:1px solid rgba(196,154,85,.55);border-radius:20px;padding:6px 13px;cursor:pointer}
.dui .pill:hover,.dui .pill.on{background:rgba(196,154,85,.16)}
.dui .pill:disabled{opacity:.45;cursor:default}
.dui .dq{font:inherit;font-size:.92rem;padding:7px 14px;border:1px solid rgba(25,58,52,.2);border-radius:20px;background:rgba(255,253,247,.9);color:var(--i);width:170px}
.dui .dq:focus-visible{outline:2px solid var(--g);outline-offset:2px}
.dui .dnote,.dui .dmsg{margin:0 0 10px;color:var(--m);font:.84rem/1.5 Arial,sans-serif;min-height:1.2em}
.dui .dmsg{margin:12px 0 0}
.dui .banner{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 14px;margin-bottom:12px;border:1px solid rgba(196,154,85,.6);border-radius:7px;background:rgba(196,154,85,.12);font:.88rem Arial,sans-serif;color:var(--i)}
.dui .dcrumb{margin:0 0 8px;font:.9rem Arial,sans-serif;color:var(--m);display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.dui .dcrumb a{color:#89672f;text-decoration:none}.dui .dcrumb a:hover{text-decoration:underline}.dui .dcrumb b{color:var(--f);font-weight:600}
.dui .dlist{background:rgba(255,253,247,.88);border:1px solid rgba(25,58,52,.16);border-radius:7px;box-shadow:0 10px 30px rgba(31,49,40,.055);overflow:hidden}
.dui .frow{display:flex;align-items:center;gap:6px;border-bottom:1px solid rgba(25,58,52,.1)}
.dui .frow:last-child{border-bottom:0}
.dui .fmain{flex:1;min-width:0;display:flex;align-items:center;gap:14px;padding:13px 16px;color:var(--i);text-decoration:none}
.dui .fmain:hover,.dui .fmain:focus-visible{background:rgba(196,154,85,.1);outline:none}
.dui .fico{flex:none;display:grid;place-items:center;width:36px;height:36px;color:var(--g);border:1px solid rgba(196,154,85,.6);border-radius:50%}
.dui .fico svg{width:18px;height:18px}
.dui .ftxt{min-width:0}
.dui .fname{display:block;color:var(--f);font-size:1.05rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dui .fmeta{display:block;margin-top:2px;color:var(--m);font:.78rem Arial,sans-serif}
.dui .fact{flex:none;display:flex;gap:2px;padding-right:10px}
.dui .fact button{font:600 .72rem Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#89672f;background:none;border:0;padding:8px;border-radius:4px;cursor:pointer}
.dui .fact button:hover{background:rgba(196,154,85,.16)}
.dui .dempty{padding:34px 22px;text-align:center;color:var(--m);line-height:1.65}
.dui .xmenu{position:fixed;z-index:30;min-width:240px;padding:6px;background:var(--p);border:1px solid rgba(25,58,52,.2);border-radius:7px;box-shadow:0 10px 30px rgba(31,49,40,.18)}
.dui .xmenu[hidden]{display:none}
.dui .xmenu button,.dui .dmove button{display:block;width:100%;text-align:left;font:.92rem Georgia,serif;color:var(--i);background:none;border:0;padding:8px 10px;border-radius:4px;cursor:pointer}
.dui .xmenu button:hover,.dui .dmove button:hover:not(:disabled){background:rgba(196,154,85,.16)}
.dui .xmenu button.danger{color:#8a2f2f}
.dui .xmenu small{display:block;padding:6px 10px 2px;color:var(--m);font:.7rem Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase}
.dui.drag .dlist{outline:2px dashed var(--g);outline-offset:3px}
.dui .ddlg{border:1px solid rgba(25,58,52,.2);border-radius:8px;background:var(--p);color:var(--i);padding:18px;width:min(900px,94vw);max-height:88vh;overflow:auto}
.dui .ddlg::backdrop{background:rgba(20,43,40,.45)}
.dui .ddlg h3{margin:0 0 10px;color:var(--f);font-weight:normal;font-size:1.3rem;overflow-wrap:anywhere}
.dui .dprev{min-height:60px}.dui .dprev img,.dui .dprev video{max-width:100%;max-height:68vh;display:block;margin:auto}.dui .dprev iframe{width:100%;height:68vh;border:1px solid rgba(25,58,52,.16)}
.dui .dprev pre{max-height:60vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;border:1px solid rgba(25,58,52,.16);border-radius:6px;padding:10px;font:.85rem/1.5 ui-monospace,Menlo,Consolas,monospace}
.dui .dprev .tbl{max-height:60vh;overflow:auto}.dui .dprev table{border-collapse:collapse;font:.85rem Arial,sans-serif}.dui .dprev td{border:1px solid rgba(25,58,52,.2);padding:3px 8px;white-space:nowrap}
.dui .dprev .pdoc{max-height:60vh;overflow:auto;background:#fff;border:1px solid rgba(25,58,52,.16);border-radius:6px;padding:16px}
.dui .dprevacts{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}
.dui .dmove{max-height:50vh;overflow:auto;border:1px solid rgba(25,58,52,.16);border-radius:6px;margin:6px 0 12px}.dui .dmove button:disabled{color:var(--m);cursor:default}.dui .dmove svg{width:15px;height:15px;vertical-align:-2px;color:var(--g)}
@media (max-width:620px){.dui .dtools{width:100%}.dui .dq{flex:1;width:auto;min-width:120px}.dui .fact{flex-direction:column;padding-right:4px}.dui .fmain{padding:12px;gap:11px}}
`;
const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SVG = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICON = {
  folder: SVG('<path d="M3.75 7.5v10.25a1 1 0 0 0 1 1h14.5a1 1 0 0 0 1-1V9.5a1 1 0 0 0-1-1h-7l-2-2.25h-5.5a1 1 0 0 0-1 1z"/>'),
  doc: SVG('<path d="M6 3.75h8l4 4v12.5H6z"/><path d="M14 3.75v4h4M9 12h6M9 15.5h6"/>'),
  sheet: SVG('<rect x="3.75" y="4.25" width="16.5" height="15.5" rx="1"/><path d="M3.75 9.5h16.5M9.25 4.25v15.5M14.75 4.25v15.5M3.75 14.5h16.5"/>'),
  file: SVG('<path d="M6 3.75h8l4 4v12.5H6z"/><path d="M14 3.75v4h4"/>')
};
const LABEL = { folder: 'Folder', doc: 'Doc', sheet: 'Sheet', file: 'File' };
const EXT = { doc: '.scribae-doc.json', sheet: '.tabula.json' };
const size = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const when = t => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const safe = n => String(n || 'file').replace(/[\\/:*?"<>|]/g, '_');
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const extOf = n => (String(n).split('.').pop() || '').toLowerCase();
function previewKind(i) {
  const m = (i.mime || '').toLowerCase(), e = extOf(i.name);
  if (i.kind === 'sheet' || i.kind === 'doc') return i.kind;
  if (/^image\/(png|jpe?g|gif|webp|svg\+xml|bmp)$/.test(m) || /^(png|jpe?g|gif|webp|svg|bmp)$/.test(e)) return 'image';
  if (m === 'application/pdf' || e === 'pdf') return 'pdf';
  if (/^audio\//.test(m) || /^(mp3|wav|ogg|m4a)$/.test(e)) return 'audio';
  if (/^video\//.test(m) || /^(mp4|webm|mov)$/.test(e)) return 'video';
  if (/^text\//.test(m) || /^(txt|md|csv|tsv|json|xml|html?|css|js|log|yml|yaml)$/.test(e)) return 'text';
  return null;
}

function mount(root, o) {
  let drive = o.drive, write = o.write !== false, items = [], map = new Map(), cwd = null, filter = 'all', query = '', menuFor = null;
  root.classList.add('dui');
  root.innerHTML =
    '<div class="dhead"><h2></h2><div class="dtools"><div class="seg">' +
    '<button class="pill on" data-f="all">All</button><button class="pill" data-f="doc">Docs</button><button class="pill" data-f="sheet">Sheets</button><button class="pill" data-f="file">Files</button></div>' +
    '<input class="dq" type="search" placeholder="Search files" aria-label="Search files"></div></div>' +
    '<div class="dacts"></div><p class="dnote"></p><div class="dbanner"></div><nav class="dcrumb" aria-label="Folders"></nav>' +
    '<div class="dlist" aria-live="polite"></div><p class="dmsg" role="status"></p>' +
    '<input type="file" class="up1" multiple hidden><input type="file" class="up2" webkitdirectory hidden>' +
    '<div class="xmenu" hidden></div><dialog class="ddlg"></dialog>';
  const $ = s => root.querySelector(s);
  const acts = $('.dacts'), list = $('.dlist'), crumb = $('.dcrumb'), menu = $('.xmenu'), dlg = $('.ddlg'), msgEl = $('.dmsg');
  $('h2').textContent = o.title || 'Your files';
  const msg = t => { msgEl.textContent = t || ''; };

  const renderActs = () => {
    acts.innerHTML = (write ? '<button class="pill" data-a="nf">New folder</button><button class="pill" data-a="up">Upload</button><button class="pill" data-a="upf" title="Upload a whole folder from your computer">Upload folder</button>' : '') +
      (o.actions || []).map((a, k) => '<button class="pill" data-x="' + k + '" title="' + esc(a.title || '') + '">' + esc(a.label) + '</button>').join('');
  };
  const par = i => i.parent && map.get(i.parent) && map.get(i.parent).kind === 'folder' ? i.parent : null;
  const kids = id => items.filter(i => par(i) === id);
  const desc = id => { const out = []; const walk = x => kids(x).forEach(k => { out.push(k); if (k.kind === 'folder') walk(k.id); }); walk(id); return out; };
  const pathOf = id => { const p = []; let x = id, n = 0; while (x && map.get(x) && n++ < 50) { p.unshift(map.get(x)); x = par(map.get(x)); } return p; };
  const fromHash = () => { const m = /^#\/([a-f0-9]{8,32})$/.exec(location.hash); return m && map.get(m[1]) && map.get(m[1]).kind === 'folder' ? m[1] : null; };

  async function load() {
    try { items = await drive.list(); map = new Map(items.map(i => [i.id, i])); cwd = fromHash(); }
    catch (e) { items = []; map = new Map(); msg('Could not load your files: ' + e.message); }
    render(); if (o.onLoad) o.onLoad(items);
  }
  const fmts = i => o.exportFormats ? o.exportFormats(i) : [['native', 'Original file (' + (EXT[i.kind] || '') + ')']];
  function row(i, flat) {
    const F = i.kind === 'folder', n = F ? kids(i.id).length : 0;
    const where = flat && par(i) ? ' · in ' + esc(pathOf(par(i)).map(p => p.name).join(' / ')) : '';
    const meta = F ? 'Folder · ' + n + ' item' + (n === 1 ? '' : 's') : (LABEL[i.kind] || 'File') + ' · ' + when(i.updated) + ' · ' + size(i.size || 0) + where;
    const ext = !F && i.kind !== 'file' && o.openHref ? o.openHref(i) : null;
    const href = F ? '#/' + i.id : ext || '#';
    let a = '';
    if (i.kind === 'file') a += '<button data-a="dl" data-i="' + i.id + '">Download</button>';
    else if (!F) a += '<button data-a="exp" data-i="' + i.id + '">Export</button>';
    if (write || (o.moreItems && o.moreItems(i).length)) a += '<button data-a="more" data-i="' + i.id + '">More</button>';
    return '<div class="frow"><a class="fmain" href="' + esc(href) + '" data-open="' + i.id + '"><span class="fico" aria-hidden="true">' + ICON[i.kind] + '</span>' +
      '<span class="ftxt"><span class="fname">' + esc(i.name) + '</span><span class="fmeta">' + meta + '</span></span></a><span class="fact">' + a + '</span></div>';
  }
  function render() {
    const ql = query.trim().toLowerCase(), flat = !!ql || filter !== 'all';
    let v;
    if (flat) { v = items.filter(i => (filter === 'all' || i.kind === filter) && i.name.toLowerCase().includes(ql)); v.sort((a, b) => b.updated - a.updated); }
    else {
      v = kids(cwd);
      v.sort((a, b) => (a.kind === 'folder') !== (b.kind === 'folder') ? (a.kind === 'folder' ? -1 : 1) : a.kind === 'folder' ? a.name.localeCompare(b.name) : b.updated - a.updated);
    }
    if (flat) crumb.innerHTML = '<span>Search results</span>';
    else {
      const p = pathOf(cwd);
      crumb.innerHTML = (p.length ? '<a href="#/">' + esc(o.rootLabel || 'Your files') + '</a>' : '<b>' + esc(o.rootLabel || 'Your files') + '</b>') +
        p.map((f, k) => ' <span>›</span> ' + (k === p.length - 1 ? '<b>' + esc(f.name) + '</b>' : '<a href="#/' + f.id + '">' + esc(f.name) + '</a>')).join('');
    }
    list.innerHTML = v.length ? v.map(i => row(i, flat)).join('') :
      '<div class="dempty">' + (flat ? 'No files match.' : cwd ? 'This folder is empty.' + (write ? '<br>Drop files here, or use Upload.' : '') : items.length ? 'Nothing at the top level.' : 'Nothing here yet.' + (write ? '<br>Write something in Docs or Sheets and choose Drive → Save, or upload a file.' : '')) + '</div>';
    root.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === filter));
  }

  /* ---- opening, downloading, exporting ---- */
  async function exportNative(i) {
    const f = await drive.get(i.id);
    saveBlob(new Blob([f.content], { type: 'application/json' }), safe(i.name) + (EXT[i.kind] || '.json'));
  }
  async function download(i) {
    try { msg('Preparing “' + i.name + '”…'); const r = await drive.download(i.id); saveBlob(r.blob, i.name); msg(''); }
    catch (e) { msg('Could not download: ' + e.message); }
  }
  async function preview(i) {
    const kind = previewKind(i), extra = o.previewActions ? o.previewActions(i) : [];
    dlg.innerHTML = '<h3>' + esc(i.name) + '</h3><div class="dprev">Loading…</div><div class="dprevacts"></div>';
    const box = dlg.querySelector('.dprev'), ac = dlg.querySelector('.dprevacts');
    ac.innerHTML = '<button class="pill" data-p="dl">Download</button>' + extra.map((x, k) => '<button class="pill" data-p="' + k + '">' + esc(x.label) + '</button>').join('') + '<button class="pill" data-p="x">Close</button>';
    ac.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.p === 'x') dlg.close();
      else if (b.dataset.p === 'dl') { i.kind === 'file' ? download(i) : exportNative(i).catch(x => msg(x.message)); }
      else extra[+b.dataset.p].run(i);
    };
    if (dlg._url) { URL.revokeObjectURL(dlg._url); dlg._url = null; }
    if (!dlg.open) dlg.showModal();
    try {
      if (kind === 'sheet') {
        const f = await drive.get(i.id), j = JSON.parse(f.content), sh = (j.sheets || [])[j.active | 0] || (j.sheets || [])[0], rows = (sh && sh.cells || []).slice(0, 200);
        box.innerHTML = '<div class="tbl"><table>' + rows.map(r => '<tr>' + (r || []).slice(0, 40).map(c => '<td>' + esc(c == null ? '' : c) + '</td>').join('') + '</tr>').join('') + '</table></div>' +
          (sh && (sh.cells || []).length > 200 ? '<p class="fmeta">Showing the first 200 rows.</p>' : '');
      } else if (kind === 'doc') {
        const f = await drive.get(i.id); let h = f.content; try { const j = JSON.parse(h); if (j && typeof j.html === 'string') h = j.html; } catch (e) {}
        box.innerHTML = '<div class="pdoc"></div>'; box.firstChild.innerHTML = window.Scribae && Scribae.clean ? Scribae.clean(h) : esc(h);
      } else if (kind) {
        const r = await drive.download(i.id);
        if (kind === 'text') { const t = await r.blob.text(); box.innerHTML = '<pre></pre>'; box.firstChild.textContent = t.slice(0, 200000) + (t.length > 200000 ? '\n… (truncated)' : ''); }
        else {
          const u = dlg._url = URL.createObjectURL(r.blob);
          box.innerHTML = kind === 'image' ? '<img alt="">' : kind === 'pdf' ? '<iframe title="PDF preview"></iframe>' : kind === 'audio' ? '<audio controls></audio>' : '<video controls></video>';
          box.firstChild.src = u;
          if (kind === 'image') box.firstChild.alt = i.name;
        }
      } else box.textContent = 'No preview for this kind of file. You can still download it.';
    } catch (e) { box.textContent = 'Could not load a preview: ' + e.message; }
  }
  dlg.addEventListener('close', () => { if (dlg._url) { URL.revokeObjectURL(dlg._url); dlg._url = null; } });
  const openItem = i => o.onOpen ? o.onOpen(i) : (previewKind(i) ? preview(i) : (i.kind === 'file' ? download(i) : exportNative(i)));

  /* ---- folders, rename, move, delete ---- */
  async function newFolder() {
    const n = prompt('Folder name'); if (!n || !n.trim()) return;
    try { await drive.mkdir(n.trim().slice(0, 120), cwd); msg('Created the folder “' + n.trim() + '”.'); await load(); } catch (e) { msg('Could not create the folder: ' + e.message); }
  }
  async function rename(i) {
    const n = prompt('New name', i.name); if (n == null) return; const name = n.trim(); if (!name || name === i.name) return;
    try {
      if (i.kind === 'sheet' || i.kind === 'doc') {
        const f = await drive.get(i.id); let c = f.content; try { const j = JSON.parse(c); j.name = name; c = JSON.stringify(j); } catch (e) {}
        await drive.save({ id: i.id, name, kind: i.kind, content: c });
      } else await drive.meta(i.id, { name });
      msg('Renamed.'); await load();
    } catch (e) { msg('Could not rename: ' + e.message); }
  }
  async function remove(i) {
    const n = i.kind === 'folder' ? desc(i.id).length : 0;
    const t = i.kind === 'folder' ? 'Delete the folder “' + i.name + '”' + (n ? ' and the ' + n + ' item' + (n > 1 ? 's' : '') + ' inside it' : '') + '? This can’t be undone.' : 'Delete “' + i.name + '”? This can’t be undone.';
    if (!confirm(t)) return;
    try { await drive.del(i.id); if (o.onDeleted) o.onDeleted(i); msg('Deleted “' + i.name + '”.'); await load(); } catch (e) { msg('Could not delete: ' + e.message); }
  }
  function moveDlg(i) {
    const fs = items.filter(f => f.kind === 'folder' && f.id !== i.id && !(i.kind === 'folder' && pathOf(f.id).some(p => p.id === i.id)));
    const key = f => pathOf(f.id).map(p => p.name.toLowerCase()).join('\u0001');
    fs.sort((a, b) => key(a).localeCompare(key(b)));
    dlg.innerHTML = '<h3>Move “' + esc(i.name) + '” to…</h3><div class="dmove"><button data-to="" ' + (par(i) === null ? 'disabled' : '') + '>' + ICON.folder + ' ' + esc(o.rootLabel || 'Your files') + ' (top level)</button>' +
      fs.map(f => '<button data-to="' + f.id + '" style="padding-left:' + (12 + (pathOf(f.id).length - 1) * 18) + 'px" ' + (par(i) === f.id ? 'disabled' : '') + '>' + ICON.folder + ' ' + esc(f.name) + '</button>').join('') +
      '</div><button class="pill" data-to="cancel">Cancel</button>';
    dlg.onclick = async e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.to === 'cancel') return dlg.close();
      dlg.close();
      try { await drive.meta(i.id, { parent: b.dataset.to || null }); msg('Moved “' + i.name + '”.'); await load(); } catch (x) { msg('Could not move: ' + x.message); }
    };
    if (!dlg.open) dlg.showModal();
  }

  /* ---- upload: files, whole folders, and drag and drop ---- */
  async function nativeKind(file) {
    if (!/\.json$/i.test(file.name) || file.size > 1.3e6) return null;
    try { const t = await file.text(), j = JSON.parse(t); return j && j.format === 'tabula' ? { kind: 'sheet', t, j } : j && j.format === 'scribae-doc' ? { kind: 'doc', t, j } : null; } catch (e) { return null; }
  }
  async function uploadAll(entries) {
    if (!write || !entries.length) return;
    const cache = new Map(), bad = []; let ok = 0, spent = 0;
    const need = async (kind, name, mime, sz) => { if (!drive.quote) return; const q = await drive.quote({ kind, name, mime, size: sz }); if (q && q.enabled && q.credits != null && q.cost > q.credits) throw new Error('needs ' + q.cost + ' credits and you have ' + q.credits); };
    const ensure = async dir => {
      let p = cwd;
      for (const nm of dir) {
        const k = (p || '') + '/' + nm;
        if (!cache.has(k)) { const ex = items.find(x => x.kind === 'folder' && par(x) === p && x.name === nm); cache.set(k, ex ? ex.id : (await drive.mkdir(nm, p)).id); }
        p = cache.get(k);
      }
      return p;
    };
    for (let n = 0; n < entries.length; n++) {
      const { file, dir } = entries[n];
      if (/^(\.DS_Store|Thumbs\.db)$/i.test(file.name)) continue;
      try {
        msg('Uploading ' + (n + 1) + ' of ' + entries.length + ': ' + file.name);
        const parent = await ensure(dir), nk = await nativeKind(file);
        await need(nk ? nk.kind : 'file', nk ? String(nk.j.name || file.name) : file.name, file.type, nk ? nk.t.length : file.size);
        const r = nk ? await drive.save({ name: String(nk.j.name || file.name.replace(/\.[^.]+$/, '')).slice(0, 120), kind: nk.kind, content: nk.t, parent })
          : await drive.upload(file, parent, pr => msg('Uploading ' + (n + 1) + ' of ' + entries.length + ': ' + file.name + ' (' + Math.round(pr * 100) + '%)'));
        spent += (r && r.charged) || 0; ok++;
      } catch (e) { bad.push(file.name + ' (' + e.message + ')'); }
    }
    await load();
    msg((ok ? 'Uploaded ' + ok + ' file' + (ok === 1 ? '' : 's') + '. ' : '') + (spent ? 'Used ' + spent + ' credit' + (spent === 1 ? '' : 's') + '. ' : '') + (bad.length ? 'Not uploaded: ' + bad.join('; ') : ''));
  }
  async function collectDrop(dt) {
    const ents = [...(dt.items || [])].map(it => it.webkitGetAsEntry ? it.webkitGetAsEntry() : null).filter(Boolean);
    if (!ents.length) return [...dt.files].map(file => ({ file, dir: [] }));
    const out = [];
    const walk = async (en, dir) => {
      if (en.isFile) { const file = await new Promise((ok, no) => en.file(ok, no)); out.push({ file, dir }); }
      else if (en.isDirectory) {
        const rd = en.createReader(); let all = [];
        for (;;) { const b = await new Promise((ok, no) => rd.readEntries(ok, no)); if (!b.length) break; all = all.concat(b); }
        for (const c of all) await walk(c, dir.concat(en.name));
      }
    };
    for (const en of ents) await walk(en, []);
    return out;
  }

  /* ---- events ---- */
  function showMenu(btn, html, t, i) {
    menuFor = { t, id: i.id }; menu.innerHTML = html;
    const r = btn.getBoundingClientRect();
    menu.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - 280)) + 'px';
    menu.style.left = Math.max(8, Math.min(r.right - 250, innerWidth - 258)) + 'px';
    menu.hidden = false;
  }
  list.onclick = e => {
    const b = e.target.closest('button');
    if (b) {
      e.preventDefault(); const i = map.get(b.dataset.i); if (!i) return;
      if (b.dataset.a === 'dl') return download(i);
      if (b.dataset.a === 'exp') return showMenu(b, '<small>Download as</small>' + fmts(i).map(([k, t]) => '<button data-k="' + esc(k) + '">' + esc(t) + '</button>').join(''), 'exp', i);
      if (b.dataset.a === 'more') {
        const ex = o.moreItems ? o.moreItems(i) : [];
        return showMenu(b, ex.map(([k, t]) => '<button data-k="' + esc(k) + '">' + esc(t) + '</button>').join('') +
          (write ? '<button data-k="rename">Rename</button><button data-k="move">Move to…</button><button data-k="del" class="danger">Delete</button>' : ''), 'more', i);
      }
      return;
    }
    const a = e.target.closest('a[data-open]'); if (!a) return;
    const i = map.get(a.dataset.open); if (!i || i.kind === 'folder') return;
    if (i.kind === 'file' || !(o.openHref && o.openHref(i))) { e.preventDefault(); openItem(i); }
  };
  menu.onclick = async e => {
    const b = e.target.closest('button'); if (!b || !menuFor) return;
    menu.hidden = true; const i = map.get(menuFor.id), k = b.dataset.k; if (!i) return;
    if (menuFor.t === 'exp') { try { if (k === 'native') await exportNative(i); else await o.doExport(i, k); } catch (x) { msg('Could not export: ' + x.message); } }
    else if (k === 'rename') rename(i); else if (k === 'move') moveDlg(i); else if (k === 'del') remove(i); else if (o.onMore) o.onMore(k, i, ctl);
  };
  document.addEventListener('click', e => { if (!menu.contains(e.target) && !e.target.closest('[data-a=exp],[data-a=more]')) menu.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') menu.hidden = true; });
  root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(); });
  $('.dq').oninput = e => { query = e.target.value; render(); };
  acts.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.x != null) return o.actions[+b.dataset.x].run(ctl);
    if (b.dataset.a === 'nf') newFolder(); else if (b.dataset.a === 'up') $('.up1').click(); else if (b.dataset.a === 'upf') $('.up2').click();
  };
  $('.up1').onchange = e => { const fl = [...e.target.files]; e.target.value = ''; uploadAll(fl.map(file => ({ file, dir: [] }))); };
  $('.up2').onchange = e => { const fl = [...e.target.files]; e.target.value = ''; uploadAll(fl.map(file => ({ file, dir: (file.webkitRelativePath || '').split('/').slice(0, -1) }))); };
  root.addEventListener('dragover', e => { if (!write) return; e.preventDefault(); root.classList.add('drag'); });
  root.addEventListener('dragleave', e => { if (!root.contains(e.relatedTarget)) root.classList.remove('drag'); });
  root.addEventListener('drop', async e => { if (!write) return; e.preventDefault(); root.classList.remove('drag'); uploadAll(await collectDrop(e.dataTransfer)); });
  addEventListener('hashchange', () => { cwd = fromHash(); render(); });
  renderActs(); render();

  const ctl = {
    load, msg, preview, download, exportNative, render,
    note: t => { $('.dnote').textContent = t || ''; },
    banner: $('.dbanner'),
    cwd: () => cwd, items: () => items,
    setDrive: d => { drive = d; }, setTitle: t => { $('h2').textContent = t; }, setRoot: t => { o.rootLabel = t; render(); }, setWrite: w => { write = !!w; renderActs(); render(); }
  };
  return ctl;
}
window.DriveUI = { mount };
})();
