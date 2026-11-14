export function managerFrameContent({b,view,content,enabledCodes,name,role="manager",managerNav,managerIcon,canAccessManagerModule,esc,typeLabel}){
  const title=managerNav.find(x=>x[0]===view)?.[1]||"Overview";
  const available=module=>enabledCodes===null||canAccessManagerModule(role,enabledCodes,module);
  const mainNav=new Set(["overview","catalog","qr","ordering","analytics","more"]);
  const nav=managerNav.filter(([key,,module])=>mainNav.has(key)&&available(module)).map(([key,label])=>'<button class="manager-nav '+(view===key?'active':'')+'" data-manager-view="'+key+'"><span>'+managerIcon(key)+'</span>'+esc(label)+(key==="ordering"?'<small class="manager-count" id="pendingCount"></small>':"")+'</button>').join("");
  const mobileNav=managerNav.filter(([key,,module])=>available(module)&&["overview","catalog","ordering","qr","more"].includes(key)).map(([key,label])=>'<button class="'+(view===key?'active':'')+'" data-manager-view="'+key+'"><span>'+managerIcon(key)+'</span><small>'+esc(key==="ordering"?"Orders":key==="catalog"?"Menu":label)+'</small></button>').join("");
  return '<div class="manager-shell"><aside class="manager-sidebar"><div class="brand"><strong>DIGITAL VISION</strong><small>BY ATELIER OG</small></div><div class="manager-business"><small>YOUR BUSINESS</small><strong>'+esc(b.name||"Your business")+'</strong><span>'+esc(b.business_type?typeLabel(b.business_type):"Manager workspace")+(b.slug?" · "+esc(b.slug):"")+'</span></div><nav>'+nav+'</nav><button id="managerSignout" class="ghost manager-signout">Sign out</button></aside><main class="manager-main"><header class="manager-top"><div><small>'+esc(b.name||"Your business")+' / MANAGER</small><h1>'+esc(title)+'</h1></div><div class="manager-top-actions"><span class="manager-connected" id="managerRouteStatus" role="status" aria-live="polite">● Session active</span><button id="managerTopSignout" class="secondary manager-top-signout" type="button">Sign out</button></div></header><section class="manager-content">'+content+'</section><nav class="manager-mobile-nav">'+mobileNav+'</nav></main></div>';
}
export function managerSkeleton(){
  return '<div class="manager-section-skeleton" aria-hidden="true"><div class="skeleton-line wide"></div><div class="skeleton-line"></div><div class="skeleton-grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div><div class="skeleton-card large"></div></div>';
}
export function managerAwait(promise,label,timeoutMs=15000){
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>{const timeoutError=new Error(label+" took too long. Please retry.");timeoutError.managerTimedOut=true;reject(timeoutError)},timeoutMs)})
  ]).finally(()=>clearTimeout(timer));
}
export function managerInlineError(label,error,esc){
  return '<div class="notice" role="alert"><strong>'+esc(label)+' could not be loaded.</strong><p>'+esc(error?.message||"Please check your connection and try again.")+'</p><button class="secondary" id="managerRouteRetry" type="button">Retry</button></div>';
}
