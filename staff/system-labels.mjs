// Translate presentation labels only. Stored identifiers, quantities and user-authored text stay unchanged.
export const systemLabels={
 '원재료·음료':'Ingredients & Drinks','포장·소모품':'Packaging & Supplies','키친 발주':'Kitchen Orders','디저트':'Desserts','빵류':'Bread',
 '치즈케이크 · 크림 포함':'Cheesecakes with Cream','베이글 & 크림치즈':'Bagels & Cream Cheese','주방 및 포장 용품':'Kitchen & Packaging Supplies',
 '소프트아이스크림 재료':'Soft Serve Ingredients','소프트아이스크림':'Soft Serve','기타 음료재료':'Other Drink Ingredients','기타음료재료':'Other Drink Ingredients',
 '당류&감미료':'Sugar & Sweeteners','두쫀쿠 재료':'Dubai Chewy Cookie Ingredients','디저트재료':'Dessert Ingredients','식사재료':'Meal Ingredients','빵재료':'Bread Ingredients',
 '식기·빨대류':'Cutlery & Straws','홀더·캐리어류':'Sleeves & Carriers','스티커·라벨류':'Stickers & Labels','영수증 용지류':'Receipt Paper','조리·작업용품':'Cooking & Work Supplies',
 '봉투·박스류':'Bags & Boxes','생일용품':'Birthday Supplies','위생용품':'Hygiene Supplies','청소용품':'Cleaning Supplies','기타빵류':'Other Bread',
 '레어 치즈케이크':'No-Bake Cheesecakes','요거트 쇼트케이크':'Yogurt Shortcakes','시루 크럼블':'Siru Crumble','미니 크루아상':'Mini Croissants','미니 스콘':'Mini Scones',
 '티백&콜드브루':'Tea Bags & Cold Brew','티백 & 콜드브루':'Tea Bags & Cold Brew','커피·차':'Tea Bags & Cold Brew','음료 베이스':'Drink Bases','음료 파우더':'Drink Powders','빙수 재료':'Bingsu Ingredients',
 '가니쉬':'Garnishes','리테일':'Retail','사워도우':'Sourdough','소스류':'Sauces','아이스크림':'Ice Cream','유제품':'Dairy','치즈케이크':'Cheesecakes','캔 음료':'Canned Drinks','커피빈':'Coffee Beans',
 '뚜껑류':'Lids','컵류':'Cups','용기류':'Containers','쿠키류':'Cookies','쿠키':'Cookies','크림밤':'Kream Bombs','티라미수':'Tiramisu','푸딩':'Puddings','시루':'Siru','홀케이크':'Whole Cakes','홀케익':'Whole Cakes','휘낭시에':'Financiers',
 '디저트류':'Desserts','기타 생산품':'Other Products','언어 / Language':'Language','한국어':'Korean',
 '개/box':'pcs/box','조각/트레이':'slices/tray','반박스':'Half box','판매분':'servings','소포장 판매분':'retail packs',
 '(쟁반용)':'(for Baking Pans)','(베이킹팬용)':'(for Baking Pans)','(치케용)':'(for Cheesecake)','(치즈케익용)':'(for Cheesecake)',
 '미확인':'Unconfirmed'
};
export const unitLabels={'개':'pcs','낱개':'pcs','봉':'bags','봉지':'bags','백':'bags','팩':'packs','통':'tubs','박스':'boxes','묶음':'bundles','켤레':'pairs','송이':'bunches','포대':'sacks','롤':'rolls','조각':'slices','트레이':'trays'};
const phrases=Object.keys(systemLabels).sort((a,b)=>b.length-a.length);
export function englishSystemLabel(value){
 let text=String(value??'');for(const key of phrases)text=text.split(key).join(systemLabels[key]);
 text=text.replace(/(\d+(?:\.\d+)?)\s*(봉지|트레이|낱개|포대|묶음|켤레|송이|박스|조각|개|봉|백|팩|통|롤)(?=$|[\s)·/,(])/g,(_,n,u)=>n+' '+(Number(n)===1?({pcs:'pc',bags:'bag',packs:'pack',tubs:'tub',boxes:'box',bundles:'bundle',pairs:'pair',bunches:'bunch',sacks:'sack',rolls:'roll',slices:'slice',trays:'tray'}[unitLabels[u]]||unitLabels[u]):unitLabels[u]));
 text=text.replace(/(^|[\s(·/,])(봉지|트레이|낱개|포대|묶음|켤레|송이|박스|조각|개|봉|백|팩|통|롤)(?=$|[\s)·/,(])/g,(_,left,u)=>left+unitLabels[u]);
 return text.replace(/(\d)(pcs|slices)(?=\/)/g,'$1 $2');
}
// Restrict this adapter to system controls/labels. Notes, document bodies and account names are not translated.
const systemContexts='button,summary,option,label,th,h1,h2,h3,h4,small,b,strong,.chips,.tagline,.os-unit,.os-last,.os-order,.me-cat';
const originalContexts='input,textarea,script,style,[contenteditable],.guide-body,.guide-text,.guide-protected,.account,.sop-watermark,[data-user-content]';
export function isSystemLabelNode(node){const p=node?.parentElement;return !!p&&!p.closest(originalContexts)&&!!p.closest(systemContexts);}
export function startSystemLabels(doc=typeof document==='undefined'?null:document){
 if(!doc||typeof MutationObserver==='undefined')return ()=>{};
 const translated=new Map();let queued=false;
 function update(){queued=false;const en=doc.documentElement.lang==='en';for(const [node,state] of translated){if(!node.isConnected){translated.delete(node);continue;}if(!en){if(node.nodeValue===state.after)node.nodeValue=state.before;translated.delete(node);}}
 if(!en||!doc.body)return;const walk=doc.createTreeWalker(doc.body,4);let node;
 while((node=walk.nextNode())){if(!isSystemLabelNode(node))continue;const before=node.nodeValue;if(!/[가-힣]/.test(before))continue;const after=englishSystemLabel(before);if(after===before)continue;
 const option=node.parentElement.closest('option');if(option&&!option.hasAttribute('value'))option.setAttribute('value',option.value);
 translated.set(node,{before,after});node.nodeValue=after;}
 }
 const schedule=()=>{if(!queued){queued=true;queueMicrotask(update);}};
 const observer=new MutationObserver(schedule);observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['lang']});update();return ()=>{observer.disconnect();};
}
