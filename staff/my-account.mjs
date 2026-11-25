export function openMyAccount({db,profile,lang,t,esc,onSaved,doc=document}){
 const dialog=doc.createElement('dialog');dialog.className='install-dialog account-dialog';dialog.setAttribute('aria-labelledby','accountTitle');
 dialog.innerHTML=`<form><h2 id="accountTitle">${t('내 정보','My account')}</h2><label>${t('기록에 남길 이름','Your name')}<input name="displayName" maxlength="120" required value="${esc(profile?.display_name||'')}"></label><label>언어 / Language<select name="language"><option value="ko" ${lang==='ko'?'selected':''}>한국어</option><option value="en" ${lang==='en'?'selected':''}>English</option></select></label><p role="alert"></p><div class="actions"><button type="submit" class="primary">${t('저장','Save')}</button><button type="button" data-close>${t('닫기','Close')}</button></div></form>`;
 doc.body.append(dialog);let saving=false;dialog.oncancel=e=>{if(saving)e.preventDefault();};dialog.onclose=()=>dialog.remove();dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(saving)return;const form=e.target,displayName=form.elements.displayName.value.trim(),language=form.elements.language.value;if(!displayName)return;saving=true;dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
 try{if(displayName!==profile.display_name){const r=await db.rpc('kream_set_display_name',{new_name:displayName});if(r.error)throw r.error;profile.display_name=r.data;}
 const r=await db.auth.updateUser({data:{preferred_language:language}});if(r.error)throw r.error;dialog.close();onSaved({displayName:profile.display_name,language});}
 catch{dialog.querySelector('[role="alert"]').textContent=t('저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.','Unable to save. Check your connection and try again.');}
 finally{saving=false;dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);}
 };dialog.showModal();
}
