// Recheck pending access after a suspended app returns, without touching active work.
export function watchPendingAccess({window,document,shouldRefresh,refresh,onError=()=>{},intervalMs=30000}){
 let running=false,stopped=false;
 async function check(){
  if(stopped||running||document.hidden||!shouldRefresh())return;
  running=true;
  try{await refresh();}catch(error){onError(error);}finally{running=false;}
 }
 window.addEventListener('focus',check);
 window.addEventListener('pageshow',check);
 document.addEventListener('visibilitychange',check);
 const timer=window.setInterval(check,intervalMs);
 return ()=>{stopped=true;window.clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);document.removeEventListener('visibilitychange',check);};
}
