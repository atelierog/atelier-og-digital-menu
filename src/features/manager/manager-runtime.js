// Owns Manager shell navigation, route loading and sign-out lifecycle.
// Feature screens and domain operations are injected to keep this controller
// independent from the legacy application coordinator.
export function createManagerRuntime(dependencies) {
  const {
    app,state,supabase,managerNavigation,managerContexts,managerNav,
    managerFrameContent,managerSkeleton,managerAwait,managerInlineError,
    managerWelcomeName,canOpenBusinessWorkspace,canAccessManagerModule,
    esc,typeLabel,isAdmin,stopOrderWatch,loadManagerWorkspace,
    cacheManagerContext,currentManagerContext,saveManagerView,managerIcon,
    managerOverview,managerOrders,managerDigitalPage,managerQr,managerOffers,
    managerCustomers,managerInquiries,managerReports,managerAutomation,
    managerTeamContent,managerMoreContent,managerModuleSetup,catalogView,
    bindManagerStaff,bindManagerOrders,bindManagerInquiries,bindManagerReports,
    bindManagerDigitalPage,bindManagerQr,bindManagerOffers,bindManagerAutomation,
    showAppToast,login
  } = dependencies;

function bindManagerFrame(id){
  document.querySelectorAll("[data-manager-view]").forEach(el=>el.onclick=()=>navigateManager(id,el.dataset.managerView));
  const signOut=async()=>{const buttons=[document.querySelector("#managerSignout"),document.querySelector("#managerTopSignout")].filter(Boolean);buttons.forEach(b=>{b.disabled=true;b.textContent="Signing out…"});stopOrderWatch();managerNavigation.invalidate();managerContexts.clear();try{const result=await supabase.auth.signOut();if(result.error)throw result.error;sessionStorage.removeItem("dv-manager-view:"+state.user?.id+":"+id);state.user=null;login()}catch(error){buttons.forEach(b=>{b.disabled=false;b.textContent="Sign out"});showAppToast("Could not sign out: "+error.message)}};
  ["#managerSignout","#managerTopSignout"].forEach(selector=>{const button=document.querySelector(selector);if(button)button.onclick=signOut});
}
function updateManagerShell(id,view,business,enabledCodes,name,role){
  const current=document.querySelector(".manager-shell");
  if(!current){app.innerHTML=managerFrameContent({b:business,view,content:managerSkeleton(),enabledCodes,name,role,managerNav,managerIcon,canAccessManagerModule,esc,typeLabel});bindManagerFrame(id);return}
  const businessBlock=document.querySelector(".manager-business");
  if(businessBlock)businessBlock.innerHTML='<small>YOUR BUSINESS</small><strong>'+esc(business.name)+'</strong><span>'+esc(typeLabel(business.business_type))+' · '+esc(business.slug)+'</span>';
  const small=document.querySelector(".manager-top small");if(small)small.textContent=business.name+" / MANAGER";
  const title=document.querySelector(".manager-top h1");if(title)title.textContent=managerNav.find(x=>x[0]===view)?.[1]||"Overview";
  const shell=managerFrameContent({b:business,view,content:"",enabledCodes,name,role,managerNav,managerIcon,canAccessManagerModule,esc,typeLabel});
  const parsed=document.createElement("div");parsed.innerHTML=shell;
  const sideNav=document.querySelector(".manager-sidebar nav"),nextNav=parsed.querySelector(".manager-sidebar nav");
  if(sideNav&&nextNav)sideNav.replaceWith(nextNav);
  const mobileNav=document.querySelector(".manager-mobile-nav"),nextMobile=parsed.querySelector(".manager-mobile-nav");
  if(mobileNav&&nextMobile)mobileNav.replaceWith(nextMobile);
  bindManagerFrame(id);
}
function navigateManager(id,view){
  app.dataset.managerBusinessId=id;app.dataset.managerView=view;saveManagerView(id,view);
  if(view!=="ordering")stopOrderWatch();
  const title=document.querySelector(".manager-top h1");if(title)title.textContent=managerNav.find(x=>x[0]===view)?.[1]||"Page";
  document.querySelectorAll("[data-manager-view]").forEach(el=>el.classList.toggle("active",el.dataset.managerView===view));
  const content=document.querySelector(".manager-content");if(content)content.innerHTML=managerSkeleton();
  const status=document.querySelector("#managerRouteStatus");if(status)status.textContent="● Session active";
  return managerView(id,view);
}
async function managerView(id,view="overview",knownMembership=null){
  const viewEpoch=managerNavigation.begin();
  app.dataset.managerRequestEpoch=String(viewEpoch);
  app.dataset.managerBusinessId=id;app.dataset.managerView=view;saveManagerView(id,view);
  if(view!=="ordering")stopOrderWatch();
  let context=currentManagerContext(id);
  const provisional={id,name:"Your business",business_type:"",slug:""};
  if(!document.querySelector(".manager-shell")){
    app.innerHTML=managerFrameContent({b:context?.business||provisional,view,content:managerSkeleton(),enabledCodes:context?new Set((context.enabledRows||[]).map(x=>state.modules.find(m=>m.id===x.module_id)?.code).filter(Boolean)):null,name:managerWelcomeName(context?.membership,state.user),role:isAdmin()?"admin":"manager",managerNav,managerIcon,canAccessManagerModule,esc,typeLabel});
    bindManagerFrame(id);
  }else{
    const title=document.querySelector(".manager-top h1");if(title)title.textContent=managerNav.find(x=>x[0]===view)?.[1]||"Overview";
    document.querySelectorAll("[data-manager-view]").forEach(el=>el.classList.toggle("active",el.dataset.managerView===view));
    const content=document.querySelector(".manager-content");if(content)content.innerHTML=managerSkeleton();
  }
  try{
    if(!context){
      const loaded=await managerAwait(loadManagerWorkspace(supabase,id,state.user.id,state.modules,knownMembership),"Manager workspace",4000);
      if(!managerNavigation.isCurrent(viewEpoch))return;
      state.modules=loaded.modules;
      cacheManagerContext(id,loaded.business,loaded.membership,loaded.enabledRows);context=currentManagerContext(id);
    }
    if(!managerNavigation.isCurrent(viewEpoch))return;
    const business=context.business,membership=context.membership;
    const accessRole=isAdmin()?"admin":membership?.role;
    if(accessRole!=="admin"&&accessRole!=="manager")throw new Error("Manager access could not be verified. Ask the platform administrator to confirm your active membership.");
    if(!canOpenBusinessWorkspace(isAdmin(),business.status))throw new Error("This business is not active.");
    const enabledIds=new Set((context.enabledRows||[]).map(x=>x.module_id));
    const enabledCodes=new Set(state.modules.filter(x=>enabledIds.has(x.id)).map(x=>x.code));
    const name=managerWelcomeName(membership,state.user);
    const allowed=managerNav.some(([key,,module])=>key===view&&canAccessManagerModule(accessRole,enabledCodes,module));
    updateManagerShell(id,view,business,enabledCodes,name,accessRole);
    if(!allowed){
      const route=managerNav.find(([key])=>key===view),required=route?.[2],moduleName=state.modules.find(x=>x.code===required)?.name||required||"This section";
      const content=document.querySelector(".manager-content");if(content)content.innerHTML='<div class="notice" role="status"><strong>'+esc(moduleName)+' is unavailable.</strong><p>This service is not enabled for this business.</p></div>';
      return;
    }
    let markup;
    if(view==="catalog"){
      await managerAwait(catalogView(id,null,null,viewEpoch,context),"Menu");
      return;
    }
    if(view==="overview")markup=await managerAwait(managerOverview(id,business,name,enabledCodes),"Overview");
    else if(view==="ordering")markup=await managerAwait(managerOrders(id),"Orders");
    else if(view==="digital_page")markup=await managerAwait(managerDigitalPage(id,business),"Digital menu");
    else if(view==="qr")markup=await managerAwait(managerQr(id,business),"Tables & QR");
    else if(view==="offers")markup=await managerAwait(managerOffers(id),"Offers");
    else if(view==="customers")markup=await managerAwait(managerCustomers(id),"Customers");
    else if(view==="inquiries")markup=await managerAwait(managerInquiries(id),"Inquiries");
    else if(view==="analytics")markup=await managerAwait(managerReports(id),"Reports");
    else if(view==="automation")markup=await managerAwait(managerAutomation(id),"Automation");
    else if(view==="team")markup=managerTeamContent(id);
    else if(view==="more")markup=managerMoreContent(enabledCodes);
    else markup=managerModuleSetup(managerNav.find(x=>x[0]===view)?.[1]||"Section",view);
    if(!managerNavigation.isCurrent(viewEpoch)||markup===undefined)return;
    const content=document.querySelector(".manager-content");if(!content)return;
    content.innerHTML=markup||'<div class="notice">This section has no content yet.</div>';
    if(view==="team")bindManagerStaff(id);
    if(view==="ordering")bindManagerOrders(id);
    if(view==="overview"){const date=document.querySelector("#overviewDate");if(date)date.onchange=()=>{app.dataset.overviewDate=date.value;navigateManager(id,"overview")}}
    if(view==="inquiries")bindManagerInquiries(id);
    if(view==="analytics")bindManagerReports(id);
    if(view==="digital_page")bindManagerDigitalPage(id,business);
    if(view==="qr")bindManagerQr(id,business);
    if(view==="offers")bindManagerOffers(id);
    if(view==="automation")bindManagerAutomation(id);
    if(managerNavigation.isCurrent(viewEpoch)&&view==="ordering")bindManagerFrame(id);
  }catch(error){
    console.error("[Digital Vision] Manager section failed",view,id,error);
    if(app.dataset.managerRequestEpoch!==String(viewEpoch))return;
    const content=document.querySelector(".manager-content");if(content)content.innerHTML=managerInlineError(managerNav.find(x=>x[0]===view)?.[1]||"Section",error,esc);
    if(error?.managerTimedOut)managerNavigation.invalidate();
    document.querySelector("#managerRouteRetry")?.addEventListener("click",()=>navigateManager(id,view),{once:true});
  }
}


  return { bindManagerFrame, updateManagerShell, navigateManager, managerView };
}
