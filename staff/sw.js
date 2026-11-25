// Network-only: never cache employee records, credentials, or API responses.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate'&&new URL(event.request.url).origin===self.location.origin){
  event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kream Operations</title><body style="font:18px system-ui;padding:32px;background:#fffaf3;color:#32342d"><h1>Kream Operations</h1><p>인터넷 연결을 확인하고 다시 열어 주세요.<br>Please reconnect to the internet and reopen the app.</p>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
 }
});

// 🔔 폰 알림 (Web Push): 서버(kream-push)가 보낸 알림을 보여주고, 누르면 그 화면을 열어요.
self.addEventListener('push',event=>{
 let d={};try{d=event.data?event.data.json():{};}catch{d={title:'Kream',body:event.data?.text()||''};}
 event.waitUntil(self.registration.showNotification(d.title||'Kream Operations',{body:d.body||'',tag:d.tag||undefined,renotify:!!d.tag,icon:'assets/icon-512.png?v=20261103',badge:'assets/apple-touch-icon.png?v=20261103',data:{url:d.url||'./'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=new URL(event.notification.data?.url||'./',self.registration.scope).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if(c.url.startsWith(self.registration.scope)&&'focus' in c){c.navigate?.(url);return c.focus();}}return self.clients.openWindow(url);}));
});
