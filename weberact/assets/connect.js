// WeberAct: where the website's forms send enquiries, and how the dashboard reaches them.
// Fill in the two values from Supabase (Project Settings → API). The publishable key is safe in the
// browser: row-level security lets visitors add enquiries but never read them (see supabase/weberact.sql).
window.WA_CONNECT = (function(){
  const SUPABASE_URL = '';   // e.g. https://abcdefghijklmnop.supabase.co
  const SUPABASE_KEY = '';   // publishable key (sb_publishable_...) or legacy anon key
  const ready = !!(SUPABASE_URL && SUPABASE_KEY);

  function headers(extra){
    const h = Object.assign({ 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, extra || {});
    if (!SUPABASE_KEY.startsWith('sb_') && !h.Authorization) h.Authorization = 'Bearer ' + SUPABASE_KEY;
    return h;
  }

  // Send one form submission. Resolves {ok, demo?, status?}; never throws.
  async function submit(table, row){
    if (!ready) return { ok: false, demo: true };
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/' + table, { method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(row), signal: ctrl.signal });
      return { ok: r.ok, status: r.status };
    } catch (e) { return { ok: false, error: String(e) }; }
    finally { clearTimeout(t); }
  }

  // Remember how the visitor arrived (first page of the visit), so the dashboard can show sources.
  try {
    if (!sessionStorage.getItem('wa-src')) {
      const utm = {};
      new URLSearchParams(location.search).forEach((v, k) => { if (k.startsWith('utm_')) utm[k] = v.slice(0, 100); });
      sessionStorage.setItem('wa-src', JSON.stringify({ referrer: (document.referrer || '').slice(0, 300), landing: location.pathname, utm }));
    }
  } catch (e) {}
  function source(){
    let s = {};
    try { s = JSON.parse(sessionStorage.getItem('wa-src') || '{}'); } catch (e) {}
    return Object.assign(s, { page: location.pathname });
  }

  return { ready, url: SUPABASE_URL, key: SUPABASE_KEY, headers, submit, source };
})();
