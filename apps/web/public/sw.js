const CACHE='cell-shell-v1';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/icon.svg'])));});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// Never cache API responses, chats, tokens, or attachments.
self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>new Response('<html lang="pt-BR"><meta name="viewport" content="width=device-width"><body style="background:#101111;color:#eee;font:18px system-ui;padding:40px"><h1>Cell está offline</h1><p>Conecte-se à sua rede e verifique se o servidor está ligado.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',{headers:{'Content-Type':'text/html'}})));});
