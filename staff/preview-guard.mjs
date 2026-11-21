// PREVIEW ONLY (branch "preview" of hanak13179/kream-ops-preview). Not for the live site.
// The preview talks to the real Supabase project so it shows real products and screens, but every
// write is blocked here: saves return an error instead of changing data. Reads keep working.
const READ_ONLY_RPC = new Set(['kream_list_accounts', 'kream_midland_report', 'kream_my_workplaces', 'kream_production_team', 'kream_signup_locations']);
const MESSAGE = '미리보기에서는 저장되지 않아요 · Preview only, nothing was saved';

function blocked() { return Promise.resolve({data: null, error: {message: MESSAGE, code: 'PREVIEW_READ_ONLY'}}); }
// Supabase query builders are chainable and awaitable; return a stand-in that is both.
function blockedBuilder() {
  const result = blocked();
  const stub = new Proxy(function () {}, {
    get(_, key) {
      if (key === 'then') return result.then.bind(result);
      if (key === 'catch') return result.catch.bind(result);
      if (key === 'finally') return result.finally.bind(result);
      return () => stub;
    },
    apply() { return stub; }
  });
  return stub;
}

export function guardPreview(db) {
  const rpc = db.rpc.bind(db);
  db.rpc = (name, ...args) => READ_ONLY_RPC.has(name) ? rpc(name, ...args) : blockedBuilder();

  const from = db.from.bind(db);
  db.from = (table) => {
    const query = from(table);
    return new Proxy(query, {
      get(target, key) {
        if (['insert', 'update', 'upsert', 'delete'].includes(key)) return () => blockedBuilder();
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };

  // storage is a getter that builds a new client each time, so wrap the getter itself.
  const proto = Object.getPrototypeOf(db);
  const desc = Object.getOwnPropertyDescriptor(db, 'storage') || Object.getOwnPropertyDescriptor(proto, 'storage');
  if (desc) {
    Object.defineProperty(db, 'storage', {
      configurable: true,
      get() {
        const storage = desc.get ? desc.get.call(db) : desc.value;
        const bucketFrom = storage.from.bind(storage);
        storage.from = (bucket) => {
          const api = bucketFrom(bucket);
          ['upload', 'update', 'remove', 'move', 'copy', 'createSignedUploadUrl', 'uploadToSignedUrl'].forEach(m => { if (api[m]) api[m] = () => blocked(); });
          return api;
        };
        return storage;
      }
    });
  }

  ['signUp', 'updateUser', 'resetPasswordForEmail'].forEach(m => { if (db.auth[m]) db.auth[m] = () => blocked(); });
  showBanner();
  return db;
}

function showBanner() {
  if (document.getElementById('preview-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'preview-banner';
  bar.textContent = '미리보기 사이트 · 저장되지 않아요 (실제 데이터는 바뀌지 않음) · PREVIEW – read only';
  bar.style.cssText = 'position:sticky;top:0;z-index:9999;background:#ffe08a;color:#3a2a00;font:600 13px/1.4 system-ui,sans-serif;text-align:center;padding:8px 12px;border-bottom:1px solid #e0b84a';
  document.body.prepend(bar);
}
