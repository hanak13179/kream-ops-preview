export const validRequestNote=value=>/^[A-Za-z0-9 \t\r\n]*$/.test(String(value??''));
export function assertRequestNote(value){if(!validRequestNote(value))throw Error('ORDER_NOTE_ENGLISH_ONLY');}
export const requestNoteMessage=t=>t('요청 메모는 영문 A–Z와 숫자 0–9만 입력할 수 있어요. 공백과 줄바꿈은 사용할 수 있습니다.','Use English letters A–Z and numbers 0–9 only. Spaces and line breaks are allowed.');
export function bindRequestNote(input,{t,onChange=()=>{},onInvalid=()=>{},errorNode}={}){
 if(!input?.addEventListener)return;let accepted=input.value||'',composing=false;
 const message=requestNoteMessage(t);
 function feedback(rejected=false){const valid=validRequestNote(input.value);input.setCustomValidity?.(valid?'':message);input.setAttribute?.('aria-invalid',String(!valid));if(errorNode){errorNode.textContent=rejected||!valid?message:'';errorNode.hidden=!(rejected||!valid);}if(rejected)onInvalid(message);}
 function reject(event){event.preventDefault();feedback(true);}
 input.addEventListener('beforeinput',event=>{if(!event.isComposing&&!composing&&event.data!=null&&!validRequestNote(event.data))reject(event);});
 input.addEventListener('paste',event=>{const text=event.clipboardData?.getData('text');if(text!=null&&!validRequestNote(text))reject(event);});
 input.addEventListener('drop',event=>{const text=event.dataTransfer?.getData('text');if(text!=null&&!validRequestNote(text))reject(event);});
 function changed(event){if(composing||event?.isComposing)return;
  if(!validRequestNote(input.value)){
   // Existing notes are never silently rewritten. Allow deleting legacy text to correct it.
   if(String(event?.inputType||'').startsWith('delete')){accepted=input.value;feedback();onChange(input.value,false);return;}
   input.value=accepted;feedback(true);return;
  }
  accepted=input.value;feedback();onChange(accepted,true);
 }
 input.addEventListener('compositionstart',()=>{composing=true;});input.addEventListener('compositionend',event=>{composing=false;changed(event);});input.addEventListener('input',changed);feedback();
}
