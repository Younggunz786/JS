// A stand-in for the claude.ai runtime (db, user, downloads) so the built page can be driven in a plain browser.
// Configured through window.__MOCK = { seed: {path: data}, me, isOwner, canEdit, people: [{id,name}] }.
(function(){
  const cfg = window.__MOCK || {};
  const store = new Map(Object.entries(cfg.seed || {}).map(([k,v]) => [k, JSON.parse(JSON.stringify(v))]));
  const listeners = new Set();
  const notify = () => setTimeout(() => listeners.forEach((l) => l()), 0);
  const copy = (v) => JSON.parse(JSON.stringify(v));
  window.__store = store; window.__saves = []; window.__writes = 0;
  const docRef = (path) => ({
    async get(){ const v = store.get(path); return { exists: v !== undefined, id: path.split("/").pop(), data: () => copy(v) }; },
    async set(data){ if (cfg.failWrites) { const e = new Error("refused"); e.code = cfg.failWrites; throw e; }
      window.__writes++; store.set(path, copy(data)); notify(); },
    onSnapshot(next){ const l = () => { const v = store.get(path); next({ exists: v !== undefined, id: path.split("/").pop(), data: () => copy(v) }); }; listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); },
  });
  const query = (name) => ({
    orderBy(){ return query(name); }, limit(){ return query(name); }, where(){ return query(name); },
    onSnapshot(next){ const l = () => { const docs = [...store.entries()].filter(([k]) => k.startsWith(name + "/") && k.split("/").length === 2)
        .map(([k, v]) => ({ id: k.split("/")[1], data: () => copy(v) })); next({ docs, size: docs.length }); };
      listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); },
  });
  const db = { doc: docRef, collection: query };
  const people = cfg.people || [];
  const user = {
    async id(){ return cfg.me ?? null; }, async isOwner(){ return !!cfg.isOwner; }, async canEdit(){ return !!cfg.canEdit; },
    async profiles(ids){ return Object.fromEntries([].concat(ids).map((id) => [id, { id, name: (people.find((p) => p.id === id) || {}).name || "", isMe: id === cfg.me }])); },
    async search(q){ return people.filter((p) => p.name.toLowerCase().includes(String(q).toLowerCase())).map((p) => ({ ...p, isMe: p.id === cfg.me })); },
  };
  const downloads = { async save(req){ window.__saves.push({ filename: req.filename, data: String(req.data) }); } };
  const caps = { db, user, downloads, assets: null };
  window.claude = { use: (name) => new Promise((r) => setTimeout(() => r(caps[name] ?? null), 5)) };
})();
