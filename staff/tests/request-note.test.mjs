import test from 'node:test';import assert from 'node:assert/strict';
import {validRequestNote,assertRequestNote,bindRequestNote} from '../request-note.mjs';
import {saveSharedBasket} from '../core.mjs';
function input(value=''){const handlers={},field={value,addEventListener:(name,fn)=>handlers[name]=fn,setCustomValidity(v){this.validity=v},setAttribute(){}};return {field,fire:(type,event={})=>handlers[type]?.(event)};}
test('English letters, digits and layout whitespace work; Korean, symbols and non-English letters are rejected',()=>{for(const v of ['', 'Cheese labels 1 pack','Milk 2\nPaper clips 3','ABC xyz 0123\t4'])assert.equal(validRequestNote(v),true);for(const v of ['우유 1','Milk / 1','0.5','Café','123!','１２３','🛒'])assert.equal(validRequestNote(v),false);});
test('invalid paste is rejected as a whole without silently corrupting the request',()=>{const {field,fire}=input('Milk 1'),error={},changed=[];bindRequestNote(field,{t:k=>k,errorNode:error,onChange:v=>changed.push(v)});let blocked=false;fire('paste',{clipboardData:{getData:()=> 'Paper clips / 2'},preventDefault(){blocked=true}});assert.ok(blocked);assert.equal(field.value,'Milk 1');assert.deepEqual(changed,[]);assert.match(error.textContent,/영문/);});
test('IME composition cannot commit Korean and valid replacement still works',()=>{const {field,fire}=input('Milk '),changed=[];bindRequestNote(field,{t:k=>k,onChange:v=>changed.push(v)});fire('compositionstart');field.value='Milk 우유';fire('input',{isComposing:true});fire('compositionend');assert.equal(field.value,'Milk ');assert.deepEqual(changed,[]);field.value='Milk 2';fire('input');assert.deepEqual(changed,['Milk 2']);});
test('legacy saved text is preserved; deleting it and entering English clears validation',()=>{const {field,fire}=input('기존 메모');bindRequestNote(field,{t:k=>k});assert.equal(field.value,'기존 메모');assert.match(field.validity,/영문/);field.value='기존';fire('input',{inputType:'deleteContentBackward'});assert.equal(field.value,'기존');field.value='Old note 1';fire('input');assert.equal(field.validity,'');});
test('invalid requests cannot reach the shared-basket save call',async()=>{assert.throws(()=>assertRequestNote('메모'),/ORDER_NOTE_ENGLISH_ONLY/);let called=false;await assert.rejects(saveSharedBasket({rpc(){called=true}},null,{note:'Milk / 1'}),/ORDER_NOTE_ENGLISH_ONLY/);assert.equal(called,false);});
test('both order note fields defer autosave while focused and resume on blur without altering text',async()=>{
 const {editingRequestNote}=await import('../request-note.mjs');
 for(const id of ['note','basketExtraRequests'])assert.equal(editingRequestNote({activeElement:{id}}),true);
 assert.equal(editingRequestNote({activeElement:{id:'search'}}),false);
 const {field,fire}=input('Labels 2'),blurred=[];bindRequestNote(field,{t:k=>k,onBlur:(text,valid)=>blurred.push({text,valid})});
 fire('blur');assert.deepEqual(blurred,[{text:'Labels 2',valid:true}]);assert.equal(field.value,'Labels 2');
});
