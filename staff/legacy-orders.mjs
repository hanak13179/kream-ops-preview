export function legacyOrderSummary(days=[]){
 let cents=0,missingPrices=0,lineCount=0;
 for(const day of days)for(const item of day.items||[]){
  lineCount++;
  if(item.unit_price==null){missingPrices++;continue;}
  const amount=Number(item.amount??Number(item.quantity)*Number(item.unit_price));
  if(!Number.isFinite(amount)){missingPrices++;continue;}
  cents+=Math.round(amount*100);
 }
 return {knownAmount:cents/100,missingPrices,lineCount,dayCount:days.length};
}
export function legacyOrdersMarkup(days,c,month){
 if(!days.length)return '';
 const {t,esc}=c,summary=legacyOrderSummary(days),money=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n);
 return '<section class="panel legacy-order-history"><p class="eyebrow">MIDLAND · '+esc(month)+'</p><h2>'+t('기존 발주시트 · 월별 주문 내역','Previous order sheet · monthly orders')+'</h2><p class="muted">'+t('시트의 주문 수량과 C열 납품가를 옮긴 기존 기록입니다. 사이트 출고·입고 확정이나 현재재고를 변경하지 않습니다.','Historical quantities and column C supply prices from the source sheet. These records do not change OPS dispatches, receipts or stock.')+'</p><div class="metrics"><div><small>'+t('기록된 날짜','Recorded days')+'</small><h2>'+summary.dayCount+'</h2></div><div><small>'+t('주문 항목','Order lines')+'</small><h2>'+summary.lineCount+'</h2></div><div><small>'+t('확인된 단가 기준 주문금액','Order amount at known prices')+'</small><h2>'+money(summary.knownAmount)+'</h2></div></div>'+(summary.missingPrices?'<p class="low-label">'+t('단가 미확인 ','Price pending: ')+summary.missingPrices+t('개 주문 항목 · 위 합계에서 제외했어요.',' order lines excluded from the total above.')+'</p>':'')+'<p><a href="https://docs.google.com/spreadsheets/d/1A-BF0eM8JKQwntVHRSIt08y69jriCZfF/edit" target="_blank" rel="noopener">'+t('원본 발주시트 보기','View source order sheet')+'</a></p>'+days.map(day=>{
 const s=legacyOrderSummary([day]);
 return '<details class="legacy-order-day"><summary><strong>'+esc(day.order_date)+'</strong> · '+s.lineCount+t('품목',' items')+' · '+money(s.knownAmount)+(s.missingPrices?' · '+t('단가 미확인 ','price pending ')+s.missingPrices:'')+'</summary><div class="table-scroll"><table><thead><tr><th>'+t('품목','Item')+'</th><th>'+t('수량','Quantity')+'</th><th>'+t('납품가 · C열','Supply price · C')+'</th><th>'+t('금액','Amount')+'</th></tr></thead><tbody>'+(day.items||[]).map(i=>'<tr><td>'+esc(c.name?.(i)||i.name_ko||i.source_label)+'<br><small class="muted">'+esc(i.source_label)+'</small></td><td>'+esc(i.quantity)+'</td><td>'+(i.unit_price==null?t('미확인','Not set'):money(Number(i.unit_price)))+'</td><td>'+(i.unit_price==null?t('합계 제외','Excluded'):money(Number(i.amount??Number(i.quantity)*Number(i.unit_price))))+'</td></tr>').join('')+'</tbody></table></div></details>';
 }).join('')+'</section>';
}
