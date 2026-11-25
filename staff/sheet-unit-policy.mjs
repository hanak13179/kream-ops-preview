// Pack sizes confirmed by the owner, 2026-11-22. These never rewrite on-hand counts.
const compact=s=>String(s||'').replace(/[\s·]/g,'');
const availabilityNames=new Set([
 '딸기 아이스크림','바닐라 아이스크림','스패너 크림','연유','연유 밀크',
 '오미자 시럽','청포도 에이드 베이스','청포도 에이드','자몽 에이드 베이스','자몽 에이드','한국 유자 에이드 베이스','한국 유자 에이드','한국 배 에이드 베이스','한국 배 에이드','제주 한라봉 에이드 베이스','제주 한라봉 에이드',
 '달고나 파우더','말차 파우더','바닐라 파우더','타이티 파우더',
 '곡물 단호박 프리미엄 티백','레몬밤 캐모마일 프리미엄 티백','민트 유자 프리미엄 티백','애프터밀 프리미엄 티백','히비스커스 오미자 프리미엄 티백',
 '그래놀라','냉동 망고','망고퓨레 소스','아몬드','인절미 파우더','죠리퐁','팥',
 '다이제스티브','달고나 캔디','로즈마리','타임','카라멜 소스',
 '딸기 네스퀵','리얼 레몬 주스','몬스터','스프라이트',
 '12oz Hot Cup','16oz Hot Cup','16oz Cold Cup','20oz Cold Cup','Hot Cup White Lid','12oz 핫컵','16oz 핫컵','16oz 콜드컵','20oz 콜드컵','핫컵 뚜껑',
 '대파크림치즈','삼각김밥김','유부','블루큐라소 시럽'
].map(compact));
const pack=(quantity,unit,factors,note='')=>({mode:'quantity',package_quantity:quantity,package_unit:unit,factors,note});
export function sheetUnitPolicy(p,sourceName=''){
 const n=compact(p?.name_ko||sourceName),source=compact(sourceName);
 if(availabilityNames.has(n)||availabilityNames.has(source))return {mode:'availability'};
 if(!p)return null;
 if(['미니 스콘','미니 크루아상'].includes(p.subgroup)&&/^bag/i.test(p.order_unit))return pack(3,'소포장 판매분',{개:3,ea:3},'1봉으로 판매용 소포장 3개 준비');
 if(p.subgroup==='베이글 & 크림치즈'&&/^bag/i.test(p.order_unit)){
  if(n==='베이글')return pack(6,'개',{개:6,ea:6});
  if(n.endsWith('크림치즈'))return pack(5,'판매분',{개:5,ea:5});
 }
 if(p.subgroup==='휘낭시에'&&/^bag$/i.test(p.order_unit))return pack(20,'개',{개:20,ea:20});
 if(n.startsWith('휘낭시에세트'))return pack(6,'개',{개:1,ea:1,set:1},'내용량 6개; 판매 1세트 = 발주 1팩');
 if(p.id==='milk')return pack(4000,'ml',{ml:4000,l:4});
 if(['sheet-95962d88b9','oat'].includes(p.id))return pack(1890,'ml',{ml:1890,l:1.89});
 if(p.id==='sheet-720a7a2472')return pack(1000,'ml',{g:1000,ml:1000,l:1},'관리자 승인 근사치: 1L ≈ 1,000g');
 if(p.id==='sheet-5e9286882f')return pack(4000,'g',{g:4000,kg:4});
 if(p.subgroup==='음료 베이스'&&n.endsWith('음료베이스'))return pack(2000,'g',{g:2000,kg:2});
 if(p.id==='sheet-c2bcf67036')return pack(4000,'ml',{ml:4000,l:4});
 return null;
}
