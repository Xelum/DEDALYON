const CACHE='forgefall-mobile-v9';
const ASSETS=["./", "./index.html", "./game.css", "./game.js", "./assets/arena_bg.webp", "./assets/arena_bg_mobile.webp", "./assets/opt/mat_ice.webp", "./assets/opt/mat_copper.webp", "./assets/opt/mat_iron.webp", "./assets/opt/mat_fire.webp", "./assets/opt/mat_wood.webp", "./assets/opt/copper_1.webp", "./assets/opt/copper_2.webp", "./assets/opt/copper_3.webp", "./assets/opt/copper_4.webp", "./assets/opt/copper_5.webp", "./assets/opt/iron_1.webp", "./assets/opt/iron_2.webp", "./assets/opt/iron_3.webp", "./assets/opt/iron_4.webp", "./assets/opt/iron_5.webp", "./assets/opt/fire_1.webp", "./assets/opt/fire_2.webp", "./assets/opt/fire_3.webp", "./assets/opt/fire_4.webp", "./assets/opt/fire_5.webp", "./assets/opt/wood_1.webp", "./assets/opt/wood_2.webp", "./assets/opt/wood_3.webp", "./assets/opt/wood_4.webp", "./assets/opt/wood_5.webp", "./assets/opt/ice_1.webp", "./assets/opt/ice_2.webp", "./assets/opt/ice_3.webp", "./assets/opt/ice_4.webp", "./assets/opt/ice_5.webp", "./assets/opt/enemy_shade_back.webp", "./assets/opt/enemy_runner_back.webp", "./assets/opt/enemy_brute_back.webp", "./assets/opt/enemy_boss_back.webp"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{})));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('forgefall-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin) return;
  if(/\.(?:webp|png|jpg|jpeg|svg)$/i.test(u.pathname)){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;})));
  }
});
