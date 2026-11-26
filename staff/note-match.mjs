// 요청 메모에 목록에 이미 있는 품목을 쳤는지 찾아요 (예: "Blueberry yogurt short cake 3 ea").
// 찾으면 '목록에 있어요 → 담기' 버튼을 보여줘서 메모 대신 발주함에 바로 담게 해요.
const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣%]+/g, ' ').trim().split(/\s+/).filter(Boolean);
function close(a, b) {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  if (a.startsWith(b) || b.startsWith(a)) return Math.abs(a.length - b.length) <= 2;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++diff > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
const SKIP = new Set(['ea', 'bag', 'bags', 'box', 'boxes', 'pack', 'packs', 'pc', 'pcs', 'for', 'the', 'and', 'of', 'please', 'more', 'need', 'case', 'cases', 'bottle', 'bottles', 'x']);
function score(lineWords, name) {
  const ws = words(name).filter(w => !SKIP.has(w) && !/^\d+$/.test(w));
  if (!ws.length) return 0;
  const hit = ws.filter(w => lineWords.some(l => close(l, w))).length;
  return hit >= Math.min(2, ws.length) && hit / ws.length >= 0.6 ? hit + hit / ws.length : 0;
}
/** text → [{line, product, qty}] (한 줄에 한 품목, 가장 잘 맞는 것) */
export function matchNoteLines(text, products) {
  const out = [];
  String(text || '').split(/\n/).forEach(line => {
    const lw = words(line).filter(w => !SKIP.has(w));
    if (!lw.length) return;
    let best = null, bestScore = 0;
    for (const p of products) {
      const sc = Math.max(score(lw, p.name_en), score(lw, p.name_ko));
      if (sc > bestScore) { best = p; bestScore = sc; }
    }
    if (!best) return;
    const n = Number((line.match(/(\d+(?:\.\d+)?)/) || [])[1]);
    out.push({line, product: best, qty: Number.isFinite(n) && n > 0 ? n : 1});
  });
  return out;
}
export function removeLine(text, line) { const lines = String(text || '').split(/\n/); const i = lines.indexOf(line); if (i >= 0) lines.splice(i, 1); return lines.join('\n').replace(/^\n+|\n+$/g, ''); }
