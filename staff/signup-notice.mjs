export function showSignupNotice(email,{t,esc,document=globalThis.document}){
 document.querySelector('#signupNoticeDialog')?.remove();
 const dialog=document.createElement('dialog');
 dialog.id='signupNoticeDialog';
 dialog.className='install-dialog signup-notice';
 dialog.setAttribute('aria-labelledby','signupNoticeTitle');
 dialog.innerHTML=`<h2 id="signupNoticeTitle">${t('가입 후 꼭 확인해 주세요','Important steps after signup')}</h2><p>${t('가입 요청을 처리했어요. 아래 이메일을 확인해 주세요.','Your signup request was processed. Check the email address below.')}</p><p><strong>${esc(email)}</strong></p><ol><li>${t('인증메일을 열어 이메일 인증을 완료해 주세요.','Open the confirmation email and verify your email address.')}</li><li>${t('메일이 보이지 않으면 스팸함도 확인해 주세요.','If the email is missing, check your spam or junk folder.')}</li><li>${t('이메일 인증 후 관리자 승인과 접속 허용까지 완료되면 로그인할 수 있어요.','After email verification, an administrator must approve your account and enable access before you can sign in.')}</li></ol><p><strong>${t('가입만으로 바로 접속할 수는 없어요. 이메일 인증과 관리자 승인이 모두 필요합니다.','Signup alone does not grant access. Both email verification and administrator approval are required.')}</strong></p><form method="dialog"><button class="primary" autofocus>${t('확인했어요','Got it')}</button></form>`;
 document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.showModal();
 return dialog;
}
