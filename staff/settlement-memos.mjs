// Free-text requests are kept verbatim and never guessed into priced dispatch lines.
export function settlementMemoOrders(report){
 const seen=new Set();
 return (report.orders||[]).filter(o=>{if(!o.id||seen.has(o.id)||o.status==='cancelled'||!String(o.note??'').trim()||o.delivery_date<report.start||o.delivery_date>report.end)return false;seen.add(o.id);return true;}).sort((a,b)=>b.delivery_date.localeCompare(a.delivery_date)||String(a.id).localeCompare(String(b.id)));
}
export function settlementMemosMarkup(report,{t,esc}){
 const rows=settlementMemoOrders(report);if(!rows.length)return '';
 return `<section class="panel settlement-memos" aria-labelledby="settlementMemosTitle"><div class="settlement-memos-heading"><h2 id="settlementMemosTitle">${t('메모 발주 · 별도 정산 확인','Memo orders · separate settlement review')}</h2><strong class="settlement-memos-badge">${t('자동정산 미포함','Not automatically priced')} · ${rows.length}${t('건',' orders')}</strong></div><p>${t('메모에 적힌 품목과 수량은 납품금액에 자동 합산되지 않습니다. 실제 출고 여부·수량·납품가를 확인하고, 정산 조정 기록과 대조해 빠짐없이 반영해 주세요.','Items and quantities in these notes are not automatically added to the goods amount. Verify actual dispatch, quantities and supply prices, and compare settlement adjustments before including them.')}</p>${rows.map(o=>`<article class="settlement-memo-order" data-memo-order="${esc(o.id)}"><div class="settlement-memo-reference"><strong>${esc(o.delivery_date)} · KR-${esc(String(o.id).slice(0,8).toUpperCase())}</strong><small>${['dispatched','received'].includes(o.status)?t('출고확정 · 메모 금액 별도 확인','Dispatch confirmed · review memo charges separately'):t('출고확정 전 · 실제 출고 확인 필요','Not dispatch confirmed · verify actual shipment')}</small></div><p class="guide-body" data-user-content>${esc(o.note)}</p></article>`).join('')}</section>`;
}
