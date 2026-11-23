// Order/receipt quantities stay in trays; shop stock counts are shown in pieces.
const tenPieceTrays=new Set(['midland-sheet-chocolate-cheesecake','midland-sheet-cream-cheesecake-plain','midland-sheet-cream-cheesecake-pistachio','midland-sheet-cream-cheesecake-earl-grey','midland-sheet-cream-cheesecake-yuzu','midland-sheet-cream-cheesecake-chestnut','midland-sheet-cream-cheesecake-tiramisu','midland-sheet-cream-cheesecake-fig','cheesecake','sheet-9fad2225f6','sheet-e7cab97855','sheet-39cdeb9512','sheet-04562b9807','sheet-9fbb33a000','sheet-08ea6b9890']);
export const cookieBags=new Set(['cookie','sheet-c4bd38d984','sheet-4c1b6660cd']);
export const stockDisplayFactor=p=>cookieBags.has(typeof p==='string'?p:p?.id||p?.product_id)?20:tenPieceTrays.has(typeof p==='string'?p:p?.id||p?.product_id)?10:1;
export function stockDisplay(p,value){return value==null||value===''?value:Math.round(Number(value)*stockDisplayFactor(p)*1000)/1000;}
export function stockInput(p,value){if(value==null||value==='')return '';const n=Number(value);if(stockDisplayFactor(p)>1&&(!Number.isInteger(n)||n<0))throw Error('STOCK_PIECES_REQUIRED');return n/stockDisplayFactor(p);}
