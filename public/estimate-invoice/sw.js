const CACHE='estimate-invoice-manager-v1';
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon.svg","./source/part01.txt","./source/part02.txt","./source/part03.txt","./source/part04.txt","./source/part05.txt","./source/part06.txt","./source/part07.txt","./source/part08.txt","./source/part09.txt","./source/part10.txt","./source/part11.txt","./source/part12.txt","./source/part13.txt","./source/part14.txt","./source/part15.txt","./source/part16.txt","./source/part17.txt","./source/part18.txt"];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(
    fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html')))
  );
});