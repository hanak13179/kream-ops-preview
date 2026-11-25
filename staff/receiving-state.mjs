import {halfBoxCount} from './packing.mjs?v=20261119-memo-items';
export const validReceiptQuantity=n=>Number.isFinite(Number(n))&&n!==''&&n!=null&&Number(n)>=0&&Number(n)<=100000&&Math.abs(Number(n)*1000-Math.round(Number(n)*1000))<1e-7;
export function receiptInputQuantity(p,raw){const n=Number(raw)*(halfBoxCount(p)===32?64:1);if(raw===''||!validReceiptQuantity(n))throw Error('RECEIPT_INVALID');return n;}
export function receivingSections(rows,values){const targets=rows.filter(p=>p.receivable>0);return {pending:targets.filter(p=>!Object.hasOwn(values,p.product_id)),checked:targets.filter(p=>Object.hasOwn(values,p.product_id))};}
export const receiptNeedsReason=(order,rows,values)=>order?.store_id==='midland'&&rows.some(p=>p.receivable>0&&Object.hasOwn(values,p.product_id)&&Number(values[p.product_id])!==p.receivable);
export function receiptCanComplete(order,rows,values,note=''){const targets=rows.filter(p=>p.receivable>0);return !!targets.length&&targets.every(p=>Object.hasOwn(values,p.product_id)&&validReceiptQuantity(values[p.product_id]))&&(!receiptNeedsReason(order,rows,values)||!!note.trim());}
