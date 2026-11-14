import { renderLogin, renderFirstLoginPassword } from "./auth/login.js";
import { createTenantContextStore } from "./core/tenant-context.js";
import { createNavigationController } from "./core/navigation.js";
import { resolvePortal } from "./core/portal-routing.js";
import { loadManagerWorkspace } from "./domains/workspaces/manager-workspace.js";
import { loadSuperAdminDashboardData } from "./features/super-admin/dashboard-repository.js";
import { bootCustomerMenu } from "./features/customer/public-menu.js";
import { renderStaffWorkspace } from "./features/staff/staff-workspace.js";
import { renderSuperAdminOverview } from "./features/super-admin/overview-screen.js";
import { createBusinessId } from "./manager/business-id.mjs";
import { canOpenBusinessWorkspace } from "./manager/business-access.mjs";
import { managerWelcomeName } from "./manager/welcome-name.mjs";
import { isStaffPassword } from "./auth/password-policy.mjs";
import { groupManagerModules, isManagerModuleAvailable, canAccessManagerModule } from "./manager/module-dashboard.mjs";
import { createClient } from "@supabase/supabase-js";
import qrCodeScriptUrl from "./vendor/qrcode.min.js?url";

const SUPABASE_URL = "https://qwyquvufneolyesfiipf.supabase.co";
const SUPABASE_KEY = "sb_publishable_P-N6bQR54Ui4idQahqQwdg_U9l6xz39";
const managerLoginMode = new URLSearchParams(window.location.search).get("login") === "manager";
const customerMenuMode = new URLSearchParams(window.location.search).has("menu");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, managerLoginMode ? { auth: { storageKey: "digital-vision-manager-auth" } } : {});
const app = document.querySelector("#app");
const state = { user:null, businesses:[], modules:[] };
let activeOrderWatch = null,deferredInstallPrompt=null;
const managerNavigation=createNavigationController();
const managerContexts=createTenantContextStore(30000);
let bootPromise=null;
let workspaceBooted=false,workspaceBootTimer=null;
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;window.deferredInstallPrompt=event});
function stopOrderWatch(){if(activeOrderWatch){supabase.removeChannel(activeOrderWatch.channel);activeOrderWatch=null}}
function watchBusinessOrders(businessId,onChange){if(activeOrderWatch?.businessId===businessId)return;stopOrderWatch();const channel=supabase.channel("orders-"+businessId),watch={businessId,channel};activeOrderWatch=watch;channel.on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:"business_id=eq."+businessId},change=>{if(document.visibilityState==="visible"&&activeOrderWatch===watch)onChange(change)}).subscribe()}

const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const typeLabel = t => ({restaurant:"Restaurant",retail:"Retail",jewellery:"Jewellery",clothing:"Clothing",salon:"Salon",services:"Services",other:"Other"}[t]||t);
const isAdmin = () => state.user?.app_metadata?.role === "admin";

function login(message=""){renderLogin({app,supabase,boot,esc},message)}
function showAppToast(message){document.querySelector("#appToast")?.remove();const toast=document.createElement("div");toast.id="appToast";toast.className="app-toast";toast.setAttribute("role","status");toast.textContent=message;document.body.append(toast);setTimeout(()=>toast.remove(),2200)}
function showAppDialog(message,{confirm=false,danger=false}={}){const old=document.querySelector("#appDialog");old?.remove();const dialog=document.createElement("dialog");dialog.id="appDialog";dialog.className="dv-dialog";dialog.innerHTML='<form method="dialog"><div class="dv-dialog-mark">DV</div><h2>Digital Vision</h2><p id="appDialogMessage"></p><div class="dv-dialog-actions"><button value="cancel" class="secondary">'+(confirm?"Cancel":"Close")+'</button>'+(confirm?'<button value="confirm" class="primary '+(danger?"danger":"")+'">Continue</button>':"")+'</div></form>';dialog.querySelector("#appDialogMessage").textContent=String(message||"");document.body.append(dialog);dialog.showModal();return new Promise(resolve=>{dialog.addEventListener("close",()=>{resolve(dialog.returnValue==="confirm");dialog.remove()},{once:true})})}
window.alert=message=>{showAppDialog(message);};
window.showAppConfirm=(message,options)=>showAppDialog(message,{confirm:true,...options});

function shell(title,content){
  stopOrderWatch();
  app.innerHTML='<div class="app-shell"><aside class="sidebar"><div class="brand"><strong>DIGITAL VISION</strong><small>BY ATELIER OG</small></div><nav>'+ (isAdmin() ? '<button data-view="home">Overview</button><button data-view="businesses">Businesses</button><button data-view="modules">Modules</button>' : '<button data-view="workspace">Workspace</button>') +'</nav><button id="signout" class="ghost">Sign out</button></aside><main class="main"><header class="topbar"><div><small>DIGITAL VISION</small><h1>'+esc(title)+'</h1></div><span class="status-dot">● Connected</span></header><section class="content">'+content+'</section><nav class="mobile-nav">'+(isAdmin() ? '<button data-view="home"><span>⌂</span><small>Overview</small></button><button data-view="businesses"><span>▦</span><small>Businesses</small></button><button data-view="modules"><span>◇</span><small>Modules</small></button>' : '<button data-view="workspace"><span>⌂</span><small>Workspace</small></button>')+'<button id="mobileMore"><span>↪</span><small>Sign out</small></button></nav></main></div>';
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>render(b.dataset.view));
  const signout=document.querySelector("#signout");
  signout.onclick=async()=>{await supabase.auth.signOut();login()};
  document.querySelector("#mobileMore").onclick=()=>signout.click();
}
const metric=(a,b,c)=>'<div class="metric"><small>'+esc(a)+'</small><strong>'+esc(b)+'</strong><span>'+esc(c)+'</span></div>';
const empty=(a,b)=>'<div class="empty"><strong>'+esc(a)+'</strong><span>'+esc(b)+'</span></div>';
const row=b=>'<button class="business-row" data-business="'+b.id+'"><div class="avatar">'+esc(b.name.slice(0,1).toUpperCase())+'</div><div class="row-main"><strong>'+esc(b.name)+'</strong><span>'+esc(typeLabel(b.business_type))+' · '+esc(b.slug)+'</span></div><span class="pill '+b.status+'">'+esc(b.status)+'</span><span class="arrow">→</span></button>';


async function businesses(){
  if(!isAdmin())return workspace();
  shell("Businesses",'<div class="panel"><div class="panel-head"><h2>Businesses</h2><button class="primary" id="newBusiness">+ Create business</button></div><div class="directory-tools"><input id="businessSearch" type="search" placeholder="Search businesses"><select id="businessStatus"><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></div><div id="list" class="business-list"></div></div>');
  const list=document.querySelector("#list"),search=document.querySelector("#businessSearch"),status=document.querySelector("#businessStatus");
  const paint=()=>{const q=search.value.trim().toLowerCase(),rows=state.businesses.filter(b=>(b.name+" "+b.slug+" "+b.business_type).toLowerCase().includes(q)&&(status.value==="all"||b.status===status.value));list.innerHTML=rows.length?rows.map(row).join(""):empty("No matching businesses","Try another search or filter.");document.querySelectorAll("[data-business]").forEach(x=>x.onclick=()=>businessDetail(x.dataset.business))};
  search.oninput=paint;status.onchange=paint;paint();document.querySelector("#newBusiness").onclick=createBusiness;
}
async function createBusiness(){
  if(!isAdmin())return workspace();
  const step=Number(app.dataset.createStep||"1"),draft=(()=>{try{return JSON.parse(app.dataset.businessDraft||"{}")}catch{return {}}})();
  if(step===2 && !state.modules.length){
    const moduleResult=await supabase.from("modules").select("*").order("name");
    if(moduleResult.error)return alert("Could not load modules: "+moduleResult.error.message);
    state.modules=moduleResult.data||[];
  }
  const bundledCodes=new Set(["catalog","ordering","qr"]),restaurantModules=state.modules.filter(m=>bundledCodes.has(m.code)),otherModules=state.modules.filter(m=>!bundledCodes.has(m.code));
  const types=["restaurant","retail","jewellery","clothing","salon","services","other"];
  let body="";
  if(step===1)body='<div class="stepper"><span class="current">Details</span><span>Modules</span><span>Manager</span><span>Review</span></div><form id="businessForm" class="form-grid"><label>Business name<input id="bname" required maxlength="120" value="'+esc(draft.name||"")+'" placeholder="Business name"></label><label>Business type<select id="btype">'+types.map(x=>'<option value="'+x+'" '+(draft.business_type===x?"selected":"")+'>'+typeLabel(x)+'</option>').join("")+'</select></label><label class="full">Business ID<input id="bslug" required pattern="[a-z0-9-]+" maxlength="80" value="'+esc(createBusinessId(draft.name||"",state.businesses))+'" placeholder="business-name" readonly><small class="compact-note">Automatically filled from the business name.</small></label><div class="full"><button class="primary">Continue</button><button type="button" class="secondary" id="cancel">Cancel</button></div></form>';
  if(step===2)body='<div class="stepper"><span>Details</span><span class="current">Modules</span><span>Manager</span><span>Review</span></div><form id="moduleForm"><div class="module-grid">'+(state.modules.length?(restaurantModules.length?'<label class="module-card"><input type="checkbox" name="module" data-module-group="restaurant" value="restaurant-menu-ordering" '+(restaurantModules.every(m=>(draft.modules||[]).includes(m.id))?"checked":"")+'><span><strong>Restaurant menu & ordering</strong><small>Menu, products, tables, QR codes, guest orders and order management.</small></span></label>':"")+otherModules.map(m=>'<label class="module-card"><input type="checkbox" name="module" value="'+esc(m.id)+'" '+((draft.modules||[]).includes(m.id)?"checked":"")+'><span><strong>'+esc(m.name)+'</strong></span></label>').join(""):'<p class="compact-note">No modules are available yet. Please refresh the page or contact the platform administrator.</p>')+'</div><div class="form-actions"><button type="button" class="secondary" id="prev">Back</button><button class="primary">Continue</button></div></form>';
  if(step===3)body='<div class="stepper"><span>Details</span><span>Modules</span><span class="current">Manager</span><span>Review</span></div><form id="managerForm" class="form-grid"><label class="full">Manager email<input id="managerEmail" type="email" required value="'+esc(draft.managerEmail||"")+'" placeholder="manager@business.com"></label><label class="full">Manager name<input id="managerName" required maxlength="120" value="'+esc(draft.managerName||"")+'" placeholder="Manager name"></label><div class="full"><p class="compact-note">Login ID, temporary password and login link will be emailed. A password change is required at first sign-in.</p><button type="button" class="secondary" id="prev">Back</button><button class="primary">Continue</button></div></form>';
  if(step===4){const selectedIds=draft.modules||[],selectedNames=[...(restaurantModules.length&&restaurantModules.every(m=>selectedIds.includes(m.id))?["Restaurant menu & ordering"]:[]),...otherModules.filter(m=>selectedIds.includes(m.id)).map(m=>m.name)];body='<div class="stepper"><span>Details</span><span>Modules</span><span>Manager</span><span class="current">Review</span></div><div class="review-list"><div><small>Business</small><strong>'+esc(draft.name||"")+'</strong></div><div><small>Business ID</small><strong>'+esc(draft.slug||"")+'</strong></div><div><small>Services</small><strong>'+esc(selectedNames.join(", ")||"None")+'</strong></div><div><small>Manager</small><strong>'+esc(draft.managerEmail||"")+'</strong></div></div><div class="form-actions"><button class="secondary" id="prev">Back</button><button class="primary" id="finishBusiness">Create business</button></div>'}
  shell("Create business",'<div class="panel narrow"><div class="panel-head"><h2>New business</h2></div>'+body+'</div>');
  const setDraft=patch=>app.dataset.businessDraft=JSON.stringify({...draft,...patch}),go=n=>{app.dataset.createStep=String(n);createBusiness()};
  const cancel=document.querySelector("#cancel");if(cancel)cancel.onclick=()=>{delete app.dataset.createStep;delete app.dataset.businessDraft;render("businesses")};
  const prev=document.querySelector("#prev");if(prev)prev.onclick=()=>go(step-1);
  const bf=document.querySelector("#businessForm");if(bf){const nameInput=document.querySelector("#bname"),idInput=document.querySelector("#bslug");nameInput.oninput=()=>{idInput.value=createBusinessId(nameInput.value,state.businesses)};bf.onsubmit=e=>{e.preventDefault();setDraft({name:nameInput.value.trim(),slug:idInput.value.trim(),business_type:document.querySelector("#btype").value});go(2)}};
  const mf=document.querySelector("#moduleForm");if(mf)mf.onsubmit=e=>{e.preventDefault();const selected=[...document.querySelectorAll('input[name="module"]:checked')];setDraft({modules:[...new Set(selected.flatMap(x=>x.dataset.moduleGroup==="restaurant"?restaurantModules.map(m=>m.id):[x.value]))]});go(3)};
  const mgr=document.querySelector("#managerForm");if(mgr)mgr.onsubmit=e=>{e.preventDefault();setDraft({managerEmail:document.querySelector("#managerEmail").value.trim().toLowerCase(),managerName:document.querySelector("#managerName").value.trim()});go(4)};
  const finish=document.querySelector("#finishBusiness");if(finish)finish.onclick=async()=>{finish.disabled=true;finish.textContent="Creating...";const d=JSON.parse(app.dataset.businessDraft||"{}");const cr=await supabase.from("businesses").insert({name:d.name,business_type:d.business_type,slug:d.slug}).select().single();if(cr.error){finish.disabled=false;finish.textContent="Create business";return alert(cr.error.message)}const b=cr.data;
    if(d.modules?.length){const mr=await supabase.from("business_modules").upsert(d.modules.map(module_id=>({business_id:b.id,module_id,enabled:true})),{onConflict:"business_id,module_id"});if(mr.error){await supabase.from("businesses").delete().eq("id",b.id);finish.disabled=false;finish.textContent="Create business";return alert(mr.error.message)}}
    const restaurantEnabled=d.modules?.some(moduleId=>restaurantModules.some(m=>m.id===moduleId))||false;
    if(restaurantEnabled){const sr=await supabase.from("restaurant_settings").upsert({business_id:b.id,customer_ordering_enabled:true},{onConflict:"business_id"});if(sr.error){if(d.modules?.length)await supabase.from("business_modules").delete().eq("business_id",b.id);await supabase.from("businesses").delete().eq("id",b.id);finish.disabled=false;finish.textContent="Create business";return alert("Could not enable restaurant menu & ordering: "+sr.error.message)}}
    const account=await supabase.functions.invoke("admin-manage-member",{body:{business_id:b.id,email:d.managerEmail,display_name:d.managerName||null,role:"manager",send_temporary_credentials:true}});
    if(account.error||account.data?.error){
      let detail=account.data?.message||account.data?.error||"";
      const context=account.error?.context;
      if(context){
        try{
          const payload=await context.clone().json();
          detail=payload.message||payload.error||payload.msg||JSON.stringify(payload);
        }catch{
          try{detail=await context.clone().text()}catch{}
        }
      }
      const status=context?.status||account.error?.status||"unknown";
      const friendly=status===401
        ?"Authentication failed while creating the manager account (HTTP 401). Please sign in again; if it continues, the server rejected the session token."
        :status===403
        ?"Permission denied while creating the manager account (HTTP 403). Confirm this account has the Super Admin role."
        :status===409
        ?"An account already exists for this manager email. Use a different email or add the existing account."
        :status===502
        ?"The manager account email could not be sent. Check the Resend API key and verified sender domain."
        :status===503
        ?"Email sending is not configured. Check the RESEND_API_KEY Supabase secret."
        :detail||account.error?.message||"Manager setup failed.";
      const message="Manager setup failed"+(status!=="unknown"?" (HTTP "+status+")":"")+": "+friendly+(detail&&detail!==friendly?"\n\nServer detail: "+detail:"");
      if(d.modules?.length)await supabase.from("business_modules").delete().eq("business_id",b.id);
      await supabase.from("businesses").delete().eq("id",b.id);
      finish.disabled=false;finish.textContent="Create business";
      return alert(message);
    }
    state.businesses.unshift(b);delete app.dataset.createStep;delete app.dataset.businessDraft;await businessDetail(b.id);alert("Business created. Manager credentials sent by email.");
  };
}
async function businessDetail(id){
  const b=state.businesses.find(x=>x.id===id);if(!b)return;
  const [mods,members,orderingSettings]=await Promise.all([
    supabase.from("business_modules").select("module_id,enabled").eq("business_id",id),
    supabase.from("business_members").select("id,user_id,role,display_name,status,created_at").eq("business_id",id).order("created_at",{ascending:true}),
    supabase.from("restaurant_settings").select("customer_ordering_enabled").eq("business_id",id).maybeSingle()
  ]);
  if(mods.error)return alert(mods.error.message);
  if(members.error)return alert(members.error.message);
  if(orderingSettings.error)return alert(orderingSettings.error.message);
  const enabled=new Set((mods.data||[]).filter(x=>x.enabled).map(x=>x.module_id));
  const bundledCodes=new Set(["catalog","ordering","qr"]),restaurantModules=state.modules.filter(m=>bundledCodes.has(m.code)),otherModules=state.modules.filter(m=>!bundledCodes.has(m.code));
  const restaurantEnabled=restaurantModules.length>0&&restaurantModules.every(m=>enabled.has(m.id));
  shell("Business",'<div class="back" id="back">← Businesses</div><div class="hero-row"><div><span class="eyebrow">'+esc(typeLabel(b.business_type))+'</span><h2>'+esc(b.name)+'</h2><p class="muted">'+esc(b.slug)+' · '+esc(b.status)+'</p></div><div class="hero-actions"><span class="pill '+b.status+'">'+esc(b.status)+'</span><button class="secondary" id="openWorkspace">Open workspace</button><button class="secondary" id="businessStatusAction">'+(b.status==="active"?"Suspend":b.status==="suspended"?"Activate":"Reactivate")+'</button><button class="secondary" id="archiveBusiness">Archive</button><button class="secondary" id="deleteBusiness">Delete permanently</button></div></div><div class="panel"><div class="panel-head"><div><h2>Business information</h2></div></div><div class="info-grid"><div><small>Business ID</small><strong>'+esc(b.slug)+'</strong></div><div><small>Type</small><strong>'+esc(typeLabel(b.business_type))+'</strong></div><div><small>Created</small><strong>'+esc(b.created_at?new Date(b.created_at).toLocaleDateString():"—")+'</strong></div></div></div><div class="panel"><div class="panel-head"><div><h2>Business access</h2><p>Choose the services this business can use.</p></div><button class="primary" id="save">Save access</button></div><div class="module-grid">'+(restaurantModules.length?'<label class="module-card"><input type="checkbox" data-module-group="restaurant" value="'+restaurantModules[0].id+'" '+(restaurantEnabled?"checked":"")+'><span><strong>Restaurant menu & ordering</strong><small>Menu, tables, QR codes, customer ordering and orders.</small></span></label>':"")+otherModules.map(m=>'<label class="module-card"><input type="checkbox" value="'+m.id+'" '+(enabled.has(m.id)?"checked":"")+'><span><strong>'+esc(m.name)+'</strong><small>'+esc(m.description||"")+'</small></span></label>').join("")+'</div></div>');
  document.querySelector("#back").onclick=()=>render("businesses");
  document.querySelector("#openWorkspace").onclick=()=>workspaceForBusiness(id);
  const performBusinessAction=async(action)=>{
    const labels={suspend:"suspend this business",activate:"activate this business",archive:"archive this business",delete:"permanently delete this business"};
    if(!await window.showAppConfirm("Are you sure you want to "+labels[action]+"?"+(action==="delete"?" This cannot be undone.":""),{danger:action==="delete"}))return;
    const buttons=["#businessStatusAction","#archiveBusiness","#deleteBusiness"].map(s=>document.querySelector(s)).filter(Boolean);
    buttons.forEach(btn=>btn.disabled=true);
    const result=await supabase.functions.invoke("admin-manage-business",{body:{business_id:id,action}});
    if(result.error||result.data?.error){
      let detail=result.data?.error||result.data?.message||result.error?.message||"Unknown server error";
      const ctx=result.error?.context;
      if(ctx){try{const payload=await ctx.clone().json();detail=payload.error||payload.message||detail}catch{}}
      buttons.forEach(btn=>btn.disabled=false);
      return alert("Business action failed: "+detail+(result.data?.code?"\nReference: "+result.data.code:""));
    }
    if(action==="delete"){
      state.businesses=state.businesses.filter(x=>x.id!==id);
      alert("Business permanently deleted.");
      return render("businesses");
    }
    const updated=result.data?.business;
    if(updated){const ix=state.businesses.findIndex(x=>x.id===id);if(ix>=0)state.businesses[ix]={...state.businesses[ix],...updated};}
    alert("Business "+(action==="suspend"?"suspended":action==="activate"?"activated":"archived")+".");
    return businessDetail(id);
  };
  const statusAction=document.querySelector("#businessStatusAction");
  if(statusAction)statusAction.onclick=()=>performBusinessAction(b.status==="active"?"suspend":"activate");
  const archiveButton=document.querySelector("#archiveBusiness");
  if(archiveButton)archiveButton.onclick=()=>performBusinessAction("archive");
  const deleteButton=document.querySelector("#deleteBusiness");
  if(deleteButton)deleteButton.onclick=()=>performBusinessAction("delete");
  document.querySelector("#save").onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent="Saving access…";
    const selected=[...document.querySelectorAll(".module-card input:checked")],ids=[...new Set(selected.flatMap(input=>input.dataset.moduleGroup==="restaurant"?restaurantModules.map(m=>m.id):[input.value]))];
    const orderingEnabled=selected.some(input=>input.dataset.moduleGroup==="restaurant");
    const result=await supabase.rpc("admin_set_business_modules",{
      p_business_id:id,
      p_module_ids:ids,
      p_customer_ordering_enabled:orderingEnabled
    });
    if(result.error){button.disabled=false;button.textContent="Save access";return alert("Could not save business access: "+result.error.message)}
    button.textContent="Saved";setTimeout(()=>{button.disabled=false;button.textContent="Save access"},1000);
  };

}
function modules(){
  if(!isAdmin())return workspace();
  shell("Modules",'<div class="panel"><div class="panel-head"><div><h2>Platform modules</h2><p>Capabilities that can be assigned per business.</p></div></div><div class="module-grid">'+state.modules.map(m=>'<div class="module-card static"><span><strong>'+esc(m.name)+'</strong><small>'+esc(m.description||"")+'</small></span><code>'+esc(m.code)+'</code></div>').join("")+'</div></div>');
}
async function workspace(){
  const r=await supabase.from("business_members").select("business_id,role,display_name,status").eq("user_id",state.user.id).eq("status","active");
  if(r.error)return error(r.error.message);
  if(!r.data?.length)return shell("Workspace",empty("No business assigned","Ask a platform administrator to add your account to a business."));
  if(r.data.length===1)return workspaceForBusiness(r.data[0].business_id,r.data[0]);
  const ids=r.data.map(x=>x.business_id);
  const bq=await supabase.from("businesses").select("*").in("id",ids).order("name");
  if(bq.error)return error(bq.error.message);
  shell("Choose business",'<div class="panel"><div class="panel-head"><div><h2>Your businesses</h2><p>Select the business workspace you want to open.</p></div></div><div class="business-list">'+(bq.data||[]).map(b=>row(b)).join("")+'</div></div>');
  document.querySelectorAll("[data-business]").forEach(x=>x.onclick=()=>workspaceForBusiness(x.dataset.business,r.data.find(m=>m.business_id===x.dataset.business)));
}

const managerNav=[
  ["overview","Overview",null], ["catalog","Menu & products","catalog"], ["digital_page","Digital menu","digital_page"],
  ["qr","Tables & QR","qr"], ["ordering","Orders & bills","ordering"], ["analytics","Reports","analytics"],
  ["team","Team access",null], ["more","More",null], ["offers","Offers","offers"],
  ["customers","Customers","customers"], ["inquiries","Inquiries","inquiries"], ["automation","Automation","automation"]
];

const CUSTOMER_STATUS_POLL_INTERVAL_MS=10000;
let qrCodeLibraryPromise=null;
function loadQrCodeLibrary(){
  if(window.QRCode)return Promise.resolve(window.QRCode);
  if(!qrCodeLibraryPromise){
    qrCodeLibraryPromise=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=qrCodeScriptUrl;
      script.async=true;
      script.onload=()=>{
        if(window.QRCode)resolve(window.QRCode);
        else{qrCodeLibraryPromise=null;reject(new Error("Local QR generator did not initialize."))}
      };
      script.onerror=()=>{qrCodeLibraryPromise=null;reject(new Error("Could not load local QR generator."))};
      document.head.append(script);
    });
  }
  return qrCodeLibraryPromise;
}
function cacheManagerContext(businessId,business,membership,enabledRows){
  managerContexts.set({businessId,userId:state.user?.id,business,membership,enabledRows:enabledRows||[]});
}
function currentManagerContext(businessId){
  return managerContexts.get(businessId,state.user?.id);
}
function savedManagerView(businessId){
  try{const view=sessionStorage.getItem("dv-manager-view:"+state.user?.id+":"+businessId);return managerNav.some(([key])=>key===view)?view:"overview"}catch{return "overview"}
}
function saveManagerView(businessId,view){
  try{sessionStorage.setItem("dv-manager-view:"+state.user?.id+":"+businessId,view)}catch{}
}

function managerFrameContent(b,view,content,enabledCodes,name,role="manager"){
  const title=managerNav.find(x=>x[0]===view)?.[1]||"Overview";
  const available=module=>enabledCodes===null||canAccessManagerModule(role,enabledCodes,module);
  const mainNav=new Set(["overview","catalog","qr","ordering","analytics","more"]);
  const nav=managerNav.filter(([key,,module])=>mainNav.has(key)&&available(module)).map(([key,label])=>'<button class="manager-nav '+(view===key?'active':'')+'" data-manager-view="'+key+'"><span>'+managerIcon(key)+'</span>'+esc(label)+(key==="ordering"?'<small class="manager-count" id="pendingCount"></small>':"")+'</button>').join("");
  const mobileNav=managerNav.filter(([key,,module])=>available(module)&&["overview","catalog","ordering","qr","more"].includes(key)).map(([key,label])=>'<button class="'+(view===key?'active':'')+'" data-manager-view="'+key+'"><span>'+managerIcon(key)+'</span><small>'+esc(key==="ordering"?"Orders":key==="catalog"?"Menu":label)+'</small></button>').join("");
  return '<div class="manager-shell"><aside class="manager-sidebar"><div class="brand"><strong>DIGITAL VISION</strong><small>BY ATELIER OG</small></div><div class="manager-business"><small>YOUR BUSINESS</small><strong>'+esc(b.name||"Your business")+'</strong><span>'+esc(b.business_type?typeLabel(b.business_type):"Manager workspace")+(b.slug?" · "+esc(b.slug):"")+'</span></div><nav>'+nav+'</nav><button id="managerSignout" class="ghost manager-signout">Sign out</button></aside><main class="manager-main"><header class="manager-top"><div><small>'+esc(b.name||"Your business")+' / MANAGER</small><h1>'+esc(title)+'</h1></div><div class="manager-top-actions"><span class="manager-connected" id="managerRouteStatus" role="status" aria-live="polite">● Session active</span><button id="managerTopSignout" class="secondary manager-top-signout" type="button">Sign out</button></div></header><section class="manager-content">'+content+'</section><nav class="manager-mobile-nav">'+mobileNav+'</nav></main></div>';
}
function managerSkeleton(){
  return '<div class="manager-section-skeleton" aria-hidden="true"><div class="skeleton-line wide"></div><div class="skeleton-line"></div><div class="skeleton-grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div><div class="skeleton-card large"></div></div>';
}
function managerAwait(promise,label,timeoutMs=15000){
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>{const timeoutError=new Error(label+" took too long. Please retry.");timeoutError.managerTimedOut=true;reject(timeoutError)},timeoutMs)})
  ]).finally(()=>clearTimeout(timer));
}
function managerInlineError(label,error){
  return '<div class="notice" role="alert"><strong>'+esc(label)+' could not be loaded.</strong><p>'+esc(error?.message||"Please check your connection and try again.")+'</p><button class="secondary" id="managerRouteRetry" type="button">Retry</button></div>';
}
function bindManagerFrame(id){
  document.querySelectorAll("[data-manager-view]").forEach(el=>el.onclick=()=>navigateManager(id,el.dataset.managerView));
  const signOut=async()=>{const buttons=[document.querySelector("#managerSignout"),document.querySelector("#managerTopSignout")].filter(Boolean);buttons.forEach(b=>{b.disabled=true;b.textContent="Signing out…"});stopOrderWatch();managerNavigation.invalidate();managerContexts.clear();try{const result=await supabase.auth.signOut();if(result.error)throw result.error;sessionStorage.removeItem("dv-manager-view:"+state.user?.id+":"+id);state.user=null;login()}catch(error){buttons.forEach(b=>{b.disabled=false;b.textContent="Sign out"});showAppToast("Could not sign out: "+error.message)}};
  ["#managerSignout","#managerTopSignout"].forEach(selector=>{const button=document.querySelector(selector);if(button)button.onclick=signOut});
}
function updateManagerShell(id,view,business,enabledCodes,name,role){
  const current=document.querySelector(".manager-shell");
  if(!current){app.innerHTML=managerFrameContent(business,view,managerSkeleton(),enabledCodes,name,role);bindManagerFrame(id);return}
  const businessBlock=document.querySelector(".manager-business");
  if(businessBlock)businessBlock.innerHTML='<small>YOUR BUSINESS</small><strong>'+esc(business.name)+'</strong><span>'+esc(typeLabel(business.business_type))+' · '+esc(business.slug)+'</span>';
  const small=document.querySelector(".manager-top small");if(small)small.textContent=business.name+" / MANAGER";
  const title=document.querySelector(".manager-top h1");if(title)title.textContent=managerNav.find(x=>x[0]===view)?.[1]||"Overview";
  const shell=managerFrameContent(business,view,"",enabledCodes,name,role);
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
  app.dataset.managerBusinessId=id;app.dataset.managerView=view;saveManagerView(id,view);
  if(view!=="ordering")stopOrderWatch();
  let context=currentManagerContext(id);
  const provisional={id,name:"Your business",business_type:"",slug:""};
  if(!document.querySelector(".manager-shell")){
    app.innerHTML=managerFrameContent(context?.business||provisional,view,managerSkeleton(),context?new Set((context.enabledRows||[]).map(x=>state.modules.find(m=>m.id===x.module_id)?.code).filter(Boolean)):null,managerWelcomeName(context?.membership,state.user),isAdmin()?"admin":"manager");
    bindManagerFrame(id);
  }else{
    const title=document.querySelector(".manager-top h1");if(title)title.textContent=managerNav.find(x=>x[0]===view)?.[1]||"Overview";
    document.querySelectorAll("[data-manager-view]").forEach(el=>el.classList.toggle("active",el.dataset.managerView===view));
    const content=document.querySelector(".manager-content");if(content)content.innerHTML=managerSkeleton();
  }
  try{
    if(!context){
      const loaded=await managerAwait(loadManagerWorkspace(supabase,id,state.user.id,state.modules,knownMembership),"Manager workspace");
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
    if(!managerNavigation.isCurrent(viewEpoch))return;
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
    if(!managerNavigation.isCurrent(viewEpoch))return;
    const content=document.querySelector(".manager-content");if(content)content.innerHTML=managerInlineError(managerNav.find(x=>x[0]===view)?.[1]||"Section",error);
    if(error?.managerTimedOut)managerNavigation.invalidate();
    document.querySelector("#managerRouteRetry")?.addEventListener("click",()=>navigateManager(id,view),{once:true});
  }
}

function managerIcon(key){return ({overview:"◫",catalog:"▤",digital_page:"◉",qr:"▦",ordering:"▣",offers:"✦",customers:"♙",inquiries:"⌕",analytics:"▥",automation:"⚙",team:"♙",more:"•••"})[key]||"◇"}
function managerMoreContent(enabled){const links=[["digital_page","Restaurant page","Set the guest-facing details and menu theme"],["offers","Offers","Manage automatic discounts"],["customers","Customers","View customer records"],["inquiries","Inquiries","Review guest questions"],["automation","Notifications","Choose order and status alerts"],["team","Team access","Manage Order Taker and Bill Counter access"]].filter(([key])=>key==="team"||enabled.has(key));return '<div class="manager-pagehead"><div><span class="eyebrow">WORKSPACE</span><h2>More tools</h2><p>Restaurant setup and daily management.</p></div></div><div class="manager-more-grid">'+links.map(([key,label,detail])=>'<button class="manager-module-card" data-manager-view="'+key+'"><span>'+managerIcon(key)+'</span><strong>'+esc(label)+'</strong><small>'+esc(detail)+'</small></button>').join("")+'</div>'}
function managerTeamContent(){return '<div class="manager-pagehead"><div><h2>Team access</h2><p>Create and manage Order Taker and Bill Counter sign-ins.</p></div></div><div class="panel"><form id="staffForm" class="form-grid"><label>Staff name<input id="staffName" maxlength="120" required placeholder="Name as it appears to the team"></label><label>Access type<select id="staffRole"><option value="order_taker">Order Taker</option><option value="bill_counter">Bill Counter</option></select></label><label class="full">Password<div class="password-field"><input id="staffPassword" type="password" minlength="6" maxlength="72" required autocomplete="new-password" placeholder="Create a staff password"><button type="button" class="password-toggle" data-password-toggle="staffPassword" aria-label="Show password" aria-pressed="false">'+eyeMarkup()+'</button></div><small class="compact-note">At least 6 characters. You can reset it any time.</small></label><div class="full"><button class="primary">Create staff sign-in</button></div></form><div id="staffFeedback" class="compact-note" aria-live="polite"></div><div class="directory-tools staff-directory-tools"><input id="staffSearch" type="search" placeholder="Search active staff" aria-label="Search staff"><button class="mini-btn" id="staffShowRemoved" type="button" aria-pressed="false">Show removed</button></div><div id="staffMembers" class="business-list"></div><dialog id="staffResetDialog" class="staff-reset-dialog"><form id="staffResetForm"><h2>Reset staff password</h2><p id="staffResetName" class="muted"></p><label>New password<div class="password-field"><input id="staffResetPassword" type="password" minlength="6" maxlength="72" required autocomplete="new-password" placeholder="Enter at least 6 characters"><button type="button" class="password-toggle" data-password-toggle="staffResetPassword" aria-label="Show password" aria-pressed="false">'+eyeMarkup()+'</button></div></label><div class="mini-actions"><button type="button" class="secondary" id="cancelStaffReset">Cancel</button><button class="primary">Save new password</button></div><span id="staffResetFeedback" class="compact-note" role="status"></span></form></dialog></div>';}
function eyeMarkup(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'}
function bindManagerStaff(id){loadStaffMembers(id)}
async function managerOverview(id,b,name,enabled){
  const selectedDate=app.dataset.overviewDate||new Date().toLocaleDateString("en-CA");
  const dayStart=new Date(selectedDate+"T00:00:00"),dayEnd=new Date(dayStart);dayEnd.setDate(dayEnd.getDate()+1);
  const [orders,catalog,orderItems]=await Promise.all([
    enabled.has("ordering")?supabase.from("orders").select("id,status,total,payment_status,created_at").eq("business_id",id).gte("created_at",dayStart.toISOString()).lt("created_at",dayEnd.toISOString()).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
    enabled.has("catalog")?supabase.from("catalog_items").select("id,name,active").eq("business_id",id):Promise.resolve({data:[],error:null}),
    enabled.has("ordering")?supabase.from("order_items").select("item_name,quantity,orders!inner(status,created_at)").eq("business_id",id).gte("orders.created_at",dayStart.toISOString()).lt("orders.created_at",dayEnd.toISOString()).neq("orders.status","cancelled"):Promise.resolve({data:[],error:null})
  ]);
  for(const x of [orders,catalog,orderItems])if(x.error)return '<div class="notice">Could not load this summary: '+esc(x.error.message)+'</div>';
  const todays=(orders.data||[]).filter(x=>x.status!=="cancelled");
  const total=todays.filter(x=>x.payment_status==="paid").reduce((n,x)=>n+Number(x.total||0),0),newOrders=todays.filter(x=>x.status==="new").length;
  const productCounts=new Map();(orderItems.data||[]).forEach(x=>productCounts.set(x.item_name,(productCounts.get(x.item_name)||0)+Number(x.quantity||0)));
  const ranked=[...productCounts].sort((a,b)=>b[1]-a[1]);
  const recent=(orders.data||[]).filter(x=>x.status!=="cancelled").slice(0,4).map(x=>'<div class="business-row"><div class="avatar">#</div><div class="row-main"><strong>Order '+esc(x.id.slice(0,8).toUpperCase())+'</strong><span>'+esc(x.status)+' · '+esc(new Date(x.created_at).toLocaleString())+'</span></div><span class="pill active">₹'+esc(Number(x.total||0).toFixed(2))+'</span></div>').join("");
  return '<div class="manager-pagehead"><div><span class="eyebrow">'+esc(typeLabel(b.business_type))+' · '+esc(b.slug)+'</span><h2>Welcome, '+esc(name)+'</h2><p>'+esc(b.name)+'</p></div><span class="pill active">'+esc(b.status)+'</span></div><div class="overview-date-control"><label for="overviewDate">Activity date</label><input id="overviewDate" type="date" value="'+esc(selectedDate)+'"></div><div class="grid metrics manager-metrics">'+metric("Orders",todays.length,"")+metric("Awaiting response",newOrders,"")+metric("Active products",(catalog.data||[]).filter(x=>x.active).length,"")+metric("Paid sales","₹"+total.toFixed(2),"")+'</div><div class="grid manager-dashgrid"><div class="panel"><div class="section-title"><div><h2>Restaurant setup</h2></div></div><div class="manager-checklist">'+[['catalog','Menu & products',enabled.has("catalog")],['digital_page','Restaurant page',enabled.has("digital_page")],['qr','Tables & QR',enabled.has("qr")],['offers','Offers',enabled.has("offers")],['team','Team access',true]].map(([key,label,on])=>'<button class="manager-task" data-manager-view="'+(on?key:"overview")+'"><span class="task-check">'+(on?"✓":"•")+'</span><span>'+esc(label)+'</span><span class="task-arrow">→</span></button>').join("")+'</div></div><div class="panel"><div class="section-title"><div><h2>Recent orders</h2></div><button class="textlink" data-manager-view="ordering">View all →</button></div><div class="business-list">'+(recent||empty("No orders yet","New orders will appear here."))+'</div><div class="popular-items"><strong>Most ordered</strong><span>'+(ranked[0]?esc(ranked[0][0])+" · "+ranked[0][1]+" sold":"No sales yet")+'</span><strong>Least ordered</strong><span>'+(ranked.length>1?esc(ranked[ranked.length-1][0])+" · "+ranked[ranked.length-1][1]+" sold":"Not enough sales yet")+'</span></div></div></div><div class="panel manager-overview-modules" style="margin-top:16px"><div class="section-title"><h2>Your tools</h2></div><div class="grid module-grid">'+state.modules.filter(m=>enabled.has(m.code)).map(m=>'<button class="manager-module-card" data-manager-view="'+esc(m.code==='catalog'?'catalog':m.code)+'"><span>'+managerIcon(m.code)+'</span><strong>'+esc(m.code==="ordering"?"Orders & bills":m.name)+'</strong></button>').join("")+'</div></div>';
}
async function managerOrders(id){
  const {data,error}=await supabase.from("orders").select("*").eq("business_id",id).order("created_at",{ascending:false}).limit(100);
  if(error)return '<div class="notice">Could not load orders: '+esc(error.message)+'</div>';
  const orders=data||[],ids=orders.map(x=>x.id),customerIds=[...new Set(orders.map(x=>x.customer_id).filter(Boolean))];
  const tableIds=[...new Set(orders.map(x=>x.table_id).filter(Boolean))];
  const [itemResult,customerResult,tableResult]=await Promise.all([
    ids.length?supabase.from("order_items").select("order_id,item_name,quantity,unit_price,line_total").eq("business_id",id).in("order_id",ids):Promise.resolve({data:[],error:null}),
    customerIds.length?supabase.from("customers").select("id,name,phone").eq("business_id",id).in("id",customerIds):Promise.resolve({data:[],error:null}),
    tableIds.length?supabase.from("restaurant_tables").select("id,table_number,label").eq("business_id",id).in("id",tableIds):Promise.resolve({data:[],error:null})
  ]);
  if(itemResult.error)return '<div class="notice">Could not load order items: '+esc(itemResult.error.message)+'</div>';
  const itemsByOrder=new Map(),customersById=new Map((customerResult.data||[]).map(x=>[x.id,x])),tablesById=new Map((tableResult.data||[]).map(x=>[x.id,x]));
  (itemResult.data||[]).forEach(x=>itemsByOrder.set(x.order_id,[...(itemsByOrder.get(x.order_id)||[]),x]));
  const byStatus={new:0,accepted:0,processing:0,delivered:0};orders.forEach(x=>byStatus[x.status]=(byStatus[x.status]||0)+1);
  return '<div class="manager-pagehead"><div><span class="eyebrow">ORDERING</span><h2>Orders & bills</h2><p>Open an order to review its customer, table and item details. Status changes are available to authorized staff.</p></div><button class="secondary" data-manager-view="overview">← Dashboard</button></div><div class="grid metrics manager-metrics">'+metric("New",byStatus.new||0,"Needs a response")+metric("Accepted",byStatus.accepted||0,"Being handled")+metric("Delivered",byStatus.delivered||0,"Completed orders")+metric("Total orders",orders.length,"Most recent 100")+'</div><div class="panel"><div class="section-title"><h2>Restaurant orders</h2><span class="compact-note">Item prices shown are saved order snapshots.</span></div><div class="directory-tools"><input id="managerOrderSearch" type="search" placeholder="Search by order, guest, item or table" aria-label="Search orders"></div><div class="item-list">'+(orders.length?orders.map(x=>{const c=customersById.get(x.customer_id),t=tablesById.get(x.table_id),its=itemsByOrder.get(x.id)||[];return '<article class="item-card order-data-row" data-order-search="'+esc([x.order_code||x.id.slice(0,8).toUpperCase(),x.customer_name_snapshot||c?.name||"Guest",t?.label||"Table "+(t?.table_number||""),x.status,its.map(it=>it.item_name).join(" ")].join(" ").toLowerCase())+'"><div><strong>Order '+esc(x.order_code||x.id.slice(0,8).toUpperCase())+' · '+esc(x.customer_name_snapshot||c?.name||"Guest")+'</strong><span>'+esc(x.status==="cancelled"?"rejected":x.status)+' · '+esc(t?.label||((t?.table_number||x.table_id)?"Table "+(t?.table_number||"—"):"Staff order"))+' · '+esc(new Date(x.created_at).toLocaleString())+(c?.phone?' · '+esc(c.phone):"")+'</span><p>'+esc(its.map(it=>it.item_name+" × "+it.quantity).join(" · ")||"Order item details unavailable")+'</p></div><div class="item-meta"><strong>₹'+esc(Number(x.total||0).toFixed(2))+'</strong><div class="mini-actions"><button class="mini-btn" data-order-detail="'+x.id+'">Open bill</button><button class="mini-btn" data-order-print="'+x.id+'">Print</button><button class="mini-btn" data-order-delete="'+x.id+'">Delete</button>'+(x.status==="new"?'<button class="mini-btn" data-order-status="accepted" data-order-id="'+x.id+'">Accept</button><button class="mini-btn" data-order-status="cancelled" data-order-id="'+x.id+'">Reject</button>':"")+(x.status==="accepted"||x.status==="processing"?'<button class="mini-btn" data-order-status="delivered" data-order-id="'+x.id+'">Mark delivered</button>':"")+'</div></div></article>'}).join(""):empty("No orders found","Customer orders will appear here once ordering is connected."))+'</div></div>';
}
function bindManagerOrders(id){
  const search=document.querySelector("#managerOrderSearch");
  watchBusinessOrders(id,()=>{if(app.dataset.managerBusinessId!==id||app.dataset.managerView!=="ordering"||!document.querySelector("#managerOrderSearch"))return;app.dataset.orderSearch=document.querySelector("#managerOrderSearch")?.value||"";managerView(id,"ordering")});
  if(search){search.value=app.dataset.orderSearch||"";const filter=()=>{app.dataset.orderSearch=search.value;const q=search.value.trim().toLowerCase();document.querySelectorAll("[data-order-search]").forEach(row=>row.hidden=!!q&&!row.dataset.orderSearch.includes(q))};search.oninput=filter;filter()}
  document.querySelectorAll("[data-order-delete]").forEach(btn=>btn.onclick=async()=>{
    const actions=btn.parentElement;
    if(btn.dataset.confirming!=="true"){
      btn.dataset.confirming="true";btn.textContent="Confirm delete";btn.classList.add("danger");
      const cancel=document.createElement("button");cancel.className="mini-btn";cancel.textContent="Cancel";
      cancel.onclick=()=>{btn.dataset.confirming="false";btn.textContent="Delete";btn.classList.remove("danger");cancel.remove();actions.querySelector(".delete-feedback")?.remove()};
      btn.insertAdjacentElement("afterend",cancel);return;
    }
    btn.disabled=true;btn.textContent="Deleting…";
    const r=await supabase.from("orders").delete().eq("id",btn.dataset.orderDelete).eq("business_id",id);
    if(r.error){btn.disabled=false;btn.textContent="Confirm delete";let note=actions.querySelector(".delete-feedback");if(!note){note=document.createElement("span");note.className="delete-feedback";note.setAttribute("role","status");actions.append(note)}note.textContent="Could not delete: "+r.error.message;return}
    await managerView(id,"ordering");
  });
  document.querySelectorAll("[data-order-status]").forEach(btn=>btn.onclick=async()=>{const original=btn.textContent;btn.disabled=true;btn.textContent=original==="Accept"?"Accepting…":original==="Reject"?"Rejecting…":"Updating…";const r=await supabase.from("orders").update({status:btn.dataset.orderStatus}).eq("id",btn.dataset.orderId).eq("business_id",id);if(r.error){btn.disabled=false;btn.textContent=original;return showAppToast("Could not update order: "+r.error.message)}showAppToast(btn.dataset.orderStatus==="accepted"?"Order accepted.":btn.dataset.orderStatus==="cancelled"?"Order rejected.":"Order marked delivered.");managerView(id,"ordering")});
  document.querySelectorAll("[data-order-detail]").forEach(btn=>btn.onclick=()=>managerBill(id,btn.dataset.orderDetail));
  document.querySelectorAll("[data-order-print]").forEach(btn=>btn.onclick=()=>managerBill(id,btn.dataset.orderPrint));
}async function managerBill(id,orderId){
  const previousManagerView=app.dataset.managerView,previousStaffView=app.dataset.staffWorkspaceActive;app.dataset.managerView="bill";app.dataset.staffWorkspaceActive="false";
  const [o,i,c]=await Promise.all([
    supabase.from("orders").select("id,order_code,status,total,currency,created_at,customer_id,customer_name_snapshot,table_id,subtotal,discount_total,tax_total,payment_status").eq("business_id",id).eq("id",orderId).single(),
    supabase.from("order_items").select("item_name,quantity,unit_price,line_total").eq("business_id",id).eq("order_id",orderId),
    supabase.from("businesses").select("name,slug").eq("id",id).single()
  ]);
  if(o.error||i.error||c.error){app.dataset.managerView=previousManagerView||"ordering";app.dataset.staffWorkspaceActive=previousStaffView||"false";return alert((o.error||i.error||c.error).message)}
  const [cust,tbl,membership]=await Promise.all([
    o.data.customer_id?supabase.from("customers").select("name,phone").eq("business_id",id).eq("id",o.data.customer_id).maybeSingle():Promise.resolve({data:null}),
    o.data.table_id?supabase.from("restaurant_tables").select("label,table_number").eq("business_id",id).eq("id",o.data.table_id).maybeSingle():Promise.resolve({data:null}),
    supabase.from("business_members").select("role").eq("business_id",id).eq("user_id",state.user.id).maybeSingle()
  ]);
  const orderCode=o.data.order_code||o.data.id.slice(0,8).toUpperCase(),customer=o.data.customer_name_snapshot||cust.data?.name||"Guest",table=tbl.data?.label||(tbl.data?.table_number?"Table "+tbl.data.table_number:"Takeaway / staff order");
  const subtotal=Number(o.data.subtotal??0),discount=Number(o.data.discount_total??0),tax=Number(o.data.tax_total??0),role=membership.data?.role;
  document.documentElement.dataset.receiptWidth="80";
  app.innerHTML='<main class="receipt-page"><button class="secondary receipt-back" id="receiptBack">← Back to orders</button><article class="receipt"><header><span>DIGITAL VISION · '+esc(c.data.name)+'</span><h1>Payment receipt</h1><p>'+esc(c.data.slug)+'</p></header><div class="receipt-meta"><span>Order '+esc(orderCode)+'</span><span>'+esc(new Date(o.data.created_at).toLocaleString())+'</span><span>'+esc(table)+'</span><span>Customer: '+esc(customer)+(cust.data?.phone?" · "+esc(cust.data.phone):"")+'</span><span>Order: '+esc(o.data.status)+' · Payment: '+esc(o.data.payment_status||"open")+'</span></div><div class="receipt-items">'+(i.data||[]).map(x=>'<div><span>'+esc(x.item_name)+' × '+esc(x.quantity)+'<small>₹'+esc(Number(x.unit_price).toFixed(2))+' each</small></span><span>₹'+esc(Number(x.line_total).toFixed(2))+'</span></div>').join("")+'</div><div class="receipt-breakdown"><div><span>Subtotal</span><span>₹'+esc(subtotal.toFixed(2))+'</span></div>'+(discount>0?'<div><span>Discount</span><span>−₹'+esc(discount.toFixed(2))+'</span></div>':"")+(tax>0?'<div><span>GST / tax</span><span>₹'+esc(tax.toFixed(2))+'</span></div>':"")+'<div class="receipt-grand-total"><strong>Total</strong><strong>₹'+esc(Number(o.data.total).toFixed(2))+'</strong></div></div><p class="receipt-note">Payment receipt only. It is not a GST tax invoice.</p><label class="receipt-paper-label">Receipt width<select id="receiptWidth"><option value="80">80 mm thermal</option><option value="58">58 mm thermal</option></select></label><button class="primary" id="printReceipt">Print receipt</button>'+(role==="bill_counter"||role==="manager"?'<button class="secondary receipt-paid" id="markOrderPaid" '+(o.data.payment_status==="paid"?"disabled":"")+'>'+(o.data.payment_status==="paid"?"Payment received":"Mark payment received")+'</button>':"")+'</article></main>';
  document.querySelector("#receiptBack").onclick=async()=>{if(role==="bill_counter"){const [business,membership]=await Promise.all([supabase.from("businesses").select("*").eq("id",id).single(),supabase.from("business_members").select("role,display_name,status").eq("business_id",id).eq("user_id",state.user.id).maybeSingle()]);return staffWorkspace(id,business.data,"bill_counter",membership.data)}managerView(id,"ordering")};
  document.querySelector("#receiptWidth").onchange=e=>document.documentElement.dataset.receiptWidth=e.target.value;
  document.querySelector("#printReceipt").onclick=()=>window.print();
  const paid=document.querySelector("#markOrderPaid");
  if(paid)paid.onclick=async()=>{paid.disabled=true;paid.textContent="Saving payment…";const r=await supabase.functions.invoke("staff-operations",{body:{action:"mark_paid",business_id:id,order_id:orderId}});if(r.error||r.data?.error){paid.disabled=false;paid.textContent="Mark payment received";return showAppToast(r.data?.error||r.error?.message||"Could not update payment status.")}await managerBill(id,orderId);showAppToast("Payment recorded.")};
}
async function managerCustomers(id){const r=await supabase.from("customers").select("id,name,phone,email,created_at").eq("business_id",id).order("created_at",{ascending:false}).limit(200);if(r.error)return '<div class="notice">'+esc(r.error.message)+'</div>';return '<div class="manager-pagehead"><div><span class="eyebrow">CUSTOMERS</span><h2>Customer list</h2><p>Contact details collected through restaurant orders and inquiries.</p></div></div><div class="panel"><div class="business-list">'+((r.data||[]).length?r.data.map(c=>'<div class="business-row"><div class="avatar">'+esc((c.name||"?").slice(0,1).toUpperCase())+'</div><div class="row-main"><strong>'+esc(c.name)+'</strong><span>'+esc(c.phone||c.email||"No contact details")+' · '+esc(new Date(c.created_at).toLocaleDateString())+'</span></div></div>').join(""):empty("No customer records yet","Customers appear here when their details are collected."))+'</div></div>'}
async function managerInquiries(id){const r=await supabase.from("inquiries").select("id,subject,message,status,created_at,customer_id").eq("business_id",id).order("created_at",{ascending:false}).limit(100);if(r.error)return '<div class="notice">'+esc(r.error.message)+'</div>';return '<div class="manager-pagehead"><div><span class="eyebrow">INQUIRIES</span><h2>Customer questions</h2><p>Review questions and mark them open or closed.</p></div></div><div class="panel"><div class="item-list">'+((r.data||[]).length?r.data.map(i=>'<article class="item-card"><div><strong>'+esc(i.subject||"Customer inquiry")+'</strong><span>'+esc(i.status)+' · '+esc(new Date(i.created_at).toLocaleString())+'</span><p>'+esc(i.message)+'</p></div><div class="mini-actions"><button class="mini-btn" data-inquiry-status="'+(i.status==="closed"?"open":"closed")+'" data-inquiry-id="'+i.id+'">Mark '+(i.status==="closed"?"open":"closed")+'</button></div></article>').join(""):empty("No inquiries yet","Customer questions will appear here."))+'</div></div>'}
function bindManagerInquiries(id){document.querySelectorAll("[data-inquiry-status]").forEach(btn=>btn.onclick=async()=>{const label=btn.textContent;btn.disabled=true;btn.textContent="Saving…";const r=await supabase.from("inquiries").update({status:btn.dataset.inquiryStatus}).eq("id",btn.dataset.inquiryId).eq("business_id",id);if(r.error){btn.disabled=false;btn.textContent=label;return showAppToast("Could not update inquiry: "+r.error.message)}await managerView(id,"inquiries");showAppToast("Inquiry updated.")})}
async function managerReports(id){const r=await supabase.from("orders").select("id,status,total,currency,created_at").eq("business_id",id).order("created_at",{ascending:false}).limit(500);if(r.error)return '<div class="notice">'+esc(r.error.message)+'</div>';const rows=r.data||[],done=rows.filter(x=>x.status==="delivered"),amount=done.reduce((n,x)=>n+Number(x.total||0),0);return '<div class="manager-pagehead"><div><span class="eyebrow">ANALYTICS</span><h2>Restaurant reports</h2><p>Sales and order summaries from saved order records.</p></div><button class="primary" id="downloadReport">Download CSV</button></div><div class="grid metrics manager-metrics">'+metric("Orders",rows.length,"Up to 500 latest")+metric("Delivered",done.length,"Completed orders")+metric("Recorded sales","₹"+amount.toFixed(2),"Delivered orders only")+metric("Average bill","₹"+(done.length?amount/done.length:0).toFixed(2),"Across delivered orders")+'</div><div class="panel"><h2>Latest orders</h2><div class="business-list">'+(rows.slice(0,30).map(x=>'<div class="business-row"><div class="avatar">₹</div><div class="row-main"><strong>'+esc(x.status)+'</strong><span>'+esc(new Date(x.created_at).toLocaleString())+'</span></div><span class="pill active">₹'+esc(Number(x.total||0).toFixed(2))+'</span></div>').join("")||empty("No report data","Orders will appear once this restaurant has activity."))+'</div></div>'}
function bindManagerReports(id){const button=document.querySelector("#downloadReport");if(!button)return;button.onclick=async()=>{const r=await supabase.from("orders").select("id,status,total,currency,created_at").eq("business_id",id).order("created_at",{ascending:false}).limit(500);if(r.error)return alert(r.error.message);const cell=v=>'"'+String(v??"").replaceAll('"','""')+'"';const csv=["order_id,status,total,currency,created_at",...(r.data||[]).map(x=>[x.id,x.status,x.total,x.currency,x.created_at].map(cell).join(","))].join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="digital-vision-orders.csv";link.click();URL.revokeObjectURL(url)}}
function managerModuleSetup(title,key,detail=""){const text={digital_page:"Add your restaurant description, logo and cover image. Preview the customer menu before you publish it.",qr:"Create a QR code for every table. Guests open the menu with the correct table already selected.",offers:"Create offers that are calculated automatically at checkout; customers cannot change the discount.",automation:"Manage order alerts and customer status updates."}[key]||"This module is enabled for your business.";return '<div class="manager-pagehead"><div><span class="eyebrow">MANAGER WORKSPACE</span><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p></div></div><div class="panel"><div class="empty"><strong>'+esc(title)+' data setup is not installed yet</strong><span>'+esc(detail||"The review build needs the reviewed restaurant database upgrade before it can save settings, QR codes or offers. Existing business data is unchanged.")+'</span></div></div>'}
async function managerDigitalPage(id,b){
  const [setting,categories,items]=await Promise.all([supabase.from("restaurant_settings").select("menu_published,customer_ordering_enabled,menu_description,logo_url,cover_url,menu_theme,gst_rate").eq("business_id",id).maybeSingle(),supabase.from("catalog_categories").select("id,name,sort_order").eq("business_id",id).eq("active",true).order("sort_order"),supabase.from("catalog_items").select("id,name,description,price,image_url,category_id,active").eq("business_id",id).eq("active",true).in("item_type",["product","food"]).order("name")]);
  if(setting.error){const missing=setting.error.code==="PGRST205"||setting.error.message?.toLowerCase().includes("restaurant_settings");return managerModuleSetup("Digital menu","digital_page",missing?"The restaurant settings table and image storage are not deployed yet. The Manager form and customer preview are built; they will save after the database upgrade is approved.":setting.error.message)}
  if(categories.error||items.error)return '<div class="notice">'+esc((categories.error||items.error).message)+'</div>';
  const s=setting.data||{},categoryName=cid=>categories.data.find(c=>c.id===cid)?.name||"Menu";
  return '<div class="manager-pagehead"><div><span class="eyebrow">DIGITAL PAGE</span><h2>Restaurant profile & menu</h2><p>Set up the guest page and review the phone preview before publishing.</p></div><span class="pill '+(s.menu_published?"active":"archived")+'">'+(s.menu_published?"Published":"Draft")+'</span></div>'+(s.customer_ordering_enabled?'':'<div class="notice ordering-access-notice"><strong>Customer ordering is off.</strong><span>Restaurant menu & ordering access is not active. Ask your platform administrator to enable it for this business.</span></div>')+'<div class="grid manager-dashgrid"><div class="panel"><form id="digitalPageForm" class="form-grid"><label class="full">Restaurant name<input value="'+esc(b.name)+'" readonly></label><label class="full">Business ID<input value="'+esc(b.slug)+'" readonly></label><label class="full">Description<textarea id="menuDescription" maxlength="320" rows="3" placeholder="A short note for guests">'+esc(s.menu_description||"")+'</textarea></label><label>Logo image URL<input id="restaurantLogo" type="url" value="'+esc(s.logo_url||"")+'" placeholder="Upload or add image URL"></label><label>Cover image URL<input id="restaurantCover" type="url" value="'+esc(s.cover_url||"")+'" placeholder="Upload or add image URL"></label><label class="full">Upload restaurant logo<input id="restaurantLogoFile" type="file" accept="image/jpeg,image/png,image/webp"><small class="compact-note">Optional · JPG, PNG or WebP · up to 8 MB.</small></label><label class="full">Upload menu cover<input id="restaurantCoverFile" type="file" accept="image/jpeg,image/png,image/webp"><small class="compact-note">Optional · a wide image works best · up to 8 MB.</small></label><label>Menu theme<select id="menuTheme"><option value="luxury-dark" '+(s.menu_theme==="luxury-dark"||!s.menu_theme?"selected":"")+'>Dark & elegant</option><option value="clean-light" '+(s.menu_theme==="clean-light"?"selected":"")+'>Platinum Premium</option><option value="warm-cafe" '+(s.menu_theme==="warm-cafe"?"selected":"")+'>Cafe</option></select></label><label>GST rate (%)<input id="gstRate" type="number" min="0" max="100" step="0.01" value="'+esc(s.gst_rate??0)+'"></label><label class="check-line"><input id="menuPublished" type="checkbox" '+(s.menu_published?"checked":"")+'><span>Publish customer menu</span></label><div class="full"><button class="primary">Save restaurant page</button><span id="digitalPageFeedback" class="compact-note" aria-live="polite"></span></div></form></div><div class="panel menu-customer-preview"><div class="section-title"><div><h2>Guest preview</h2><p>Live menu details and products.</p></div></div><div class="guest-menu-head" style="'+(s.cover_url?'background-image:linear-gradient(100deg,#f4f0e9dd,#f4f0e9a8),url('+esc(s.cover_url)+')':'')+'"><div class="guest-logo">'+(s.logo_url?'<img src="'+esc(s.logo_url)+'" alt="Restaurant logo">':esc(b.name.slice(0,1).toUpperCase()))+'</div></div><h3>'+esc(b.name)+'</h3><p class="muted">'+esc(s.menu_description||"Your restaurant description will appear here.")+'</p><input class="guest-search" type="search" placeholder="Search dishes" id="guestSearch"><div class="guest-categories">'+categories.data.map(c=>'<span>'+esc(c.name)+'</span>').join("")+'</div><div class="guest-items" id="guestItems">'+items.data.map(it=>'<article class="guest-item" data-product-name="'+esc(it.name.toLowerCase())+'"><div><strong>'+esc(it.name)+'</strong><small>'+esc(categoryName(it.category_id))+' · '+esc(it.description||"")+'</small><b>₹'+esc(Number(it.price||0).toFixed(2))+'</b></div>'+(it.image_url?'<img src="'+esc(it.image_url)+'" alt="'+esc(it.name)+'">':'<span class="guest-photo-placeholder">Photo optional</span>')+'</article>').join("")+'</div><small class="compact-note">Menu preview · offers apply automatically.</small></div></div>';
}
async function uploadManagerImage(id,file,folder){if(!file)return {url:null};if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024)return {error:"Choose a JPG, PNG or WebP image under 8 MB."};const path=id+"/"+folder+"/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"-");const upload=await supabase.storage.from("digital-menu-media").upload(path,file,{contentType:file.type,upsert:false});if(upload.error)return {error:upload.error.message};return {url:supabase.storage.from("digital-menu-media").getPublicUrl(path).data.publicUrl}}
function bindManagerDigitalPage(id,b){const form=document.querySelector("#digitalPageForm");if(!form)return;for(const [inputId,previewId] of [["restaurantLogoFile","restaurantLogoPreview"],["restaurantCoverFile","restaurantCoverPreview"]]){const input=document.querySelector("#"+inputId);input.onchange=()=>{const file=input.files?.[0];if(!file)return;let preview=document.querySelector("#"+previewId);if(!preview){preview=document.createElement("img");preview.id=previewId;preview.className="catalog-image-preview";input.after(preview)}preview.src=URL.createObjectURL(file)}}form.onsubmit=async e=>{e.preventDefault();const feedback=document.querySelector("#digitalPageFeedback"),button=e.submitter,label=e.submitter.textContent;button.disabled=true;button.textContent="Saving page…";feedback.textContent="Uploading images and saving…";const logo=await uploadManagerImage(id,document.querySelector("#restaurantLogoFile").files?.[0],"branding"),cover=await uploadManagerImage(id,document.querySelector("#restaurantCoverFile").files?.[0],"branding");if(logo.error||cover.error){feedback.textContent="Image upload failed: "+(logo.error||cover.error);button.disabled=false;button.textContent=label;return}const payload={business_id:id,menu_description:document.querySelector("#menuDescription").value.trim()||null,logo_url:logo.url||document.querySelector("#restaurantLogo").value.trim()||null,cover_url:cover.url||document.querySelector("#restaurantCover").value.trim()||null,menu_theme:document.querySelector("#menuTheme").value,gst_rate:Number(document.querySelector("#gstRate").value),menu_published:document.querySelector("#menuPublished").checked};const result=await supabase.from("restaurant_settings").upsert(payload,{onConflict:"business_id"});button.disabled=false;button.textContent=label;feedback.textContent=result.error?"Could not save: "+result.error.message:"Restaurant page saved."}}
async function managerQr(id,b){const result=await supabase.from("restaurant_tables").select("id,table_number,label,qr_token,active,created_at").eq("business_id",id).order("table_number");if(result.error)return managerModuleSetup("Tables & QR","qr",result.error.code==="PGRST205"?"The table and QR database migration is not installed yet.":result.error.message);return '<div class="manager-pagehead"><div><span class="eyebrow">TABLES & QR</span><h2>Restaurant tables</h2><p>Create a unique QR for each table. Print the code and place it on that table.</p></div></div><div class="panel"><form id="tableForm" class="form-grid"><label>Table number<input id="tableNumber" type="number" min="1" required></label><label>Table label<input id="tableLabel" maxlength="60" placeholder="Window table"></label><div class="full"><button class="primary">Add table</button><span id="tableFeedback" class="compact-note" aria-live="polite"></span></div></form><div class="manager-table-list">'+((result.data||[]).length?result.data.map(t=>'<article class="manager-table-row"><div><strong>Table '+esc(t.table_number)+'</strong><small>'+esc(t.label||"")+' · '+(t.active?"Active":"Inactive")+'</small></div><button class="mini-btn" data-table-qr="'+esc(t.id)+'" data-token="'+esc(t.qr_token)+'" data-table-number="'+esc(t.table_number)+'">Show & print QR</button><button class="mini-btn" data-table-active="'+esc(t.id)+'" data-active="'+(!t.active)+'">'+(t.active?"Deactivate":"Activate")+'</button><div class="table-qr" id="qr-'+esc(t.id)+'"></div></article>').join(""):empty("No tables yet","Add your first table to create its QR code."))+'</div></div>'}
async function bindManagerQr(id,b){const form=document.querySelector("#tableForm");if(form)form.onsubmit=async e=>{e.preventDefault();const feedback=document.querySelector("#tableFeedback"),n=Number(document.querySelector("#tableNumber").value),button=e.submitter;button.disabled=true;button.textContent="Adding…";const r=await supabase.from("restaurant_tables").insert({business_id:id,table_number:n,label:document.querySelector("#tableLabel").value.trim()||"Table "+n});button.disabled=false;button.textContent="Add table";feedback.textContent=r.error?r.error.message:"Table added.";if(!r.error){managerView(id,"qr");showAppToast("Table added.")}};document.querySelectorAll("[data-table-active]").forEach(btn=>btn.onclick=async()=>{const label=btn.textContent;btn.disabled=true;btn.textContent=btn.dataset.active==="true"?"Activating…":"Deactivating…";const r=await supabase.from("restaurant_tables").update({active:btn.dataset.active==="true"}).eq("id",btn.dataset.tableActive).eq("business_id",id);if(r.error){btn.disabled=false;btn.textContent=label;return showAppToast("Could not update table: "+r.error.message)}await managerView(id,"qr");showAppToast(btn.dataset.active==="true"?"Table activated.":"Table deactivated.")});document.querySelectorAll("[data-table-qr]").forEach(btn=>btn.onclick=async()=>{const label=btn.textContent;btn.disabled=true;btn.textContent="Preparing QR…";const url=location.origin+"/?menu="+encodeURIComponent(b.slug)+"&table="+encodeURIComponent(btn.dataset.token);const target=document.querySelector("#qr-"+CSS.escape(btn.dataset.tableQr));try{const QRCodeClass=await loadQrCodeLibrary();target.innerHTML="";const qrHost=document.createElement("div");new QRCodeClass(qrHost,{text:url,width:190,height:190,colorDark:"#111111",colorLight:"#ffffff",correctLevel:QRCodeClass.CorrectLevel.H});const canvas=qrHost.querySelector("canvas"),image=qrHost.querySelector("img");if(!canvas&&!image&&!qrHost.querySelector("table"))throw new Error("QR rendering failed.");if(canvas){canvas.setAttribute("role","img");canvas.setAttribute("aria-label","Table QR code")}if(image)image.alt="Table QR code";target.append(qrHost);const note=document.createElement("p");note.className="qr-print-message";note.textContent="Scan this QR code to view the menu and order at this table.";target.append(note);const link=document.createElement("a");link.href=url;link.textContent=url;link.target="_blank";target.append(link);const print=document.createElement("button");print.className="mini-btn";print.textContent="Print this table QR";print.onclick=()=>{const row=btn.closest(".manager-table-row");row.classList.add("qr-printing");document.body.classList.add("qr-print-mode");const cleanup=()=>{row.classList.remove("qr-printing");document.body.classList.remove("qr-print-mode")};window.addEventListener("afterprint",cleanup,{once:true});window.print();setTimeout(cleanup,1500)};target.append(print);btn.disabled=false;btn.textContent="QR ready"}catch(err){btn.disabled=false;btn.textContent=label;target.textContent="QR preview unavailable: "+err.message}})}
async function managerOffers(id){const r=await supabase.from("restaurant_offers").select("id,name,description,discount_kind,discount_value,starts_at,ends_at,active").eq("business_id",id).order("created_at",{ascending:false});if(r.error)return managerModuleSetup("Offers","offers",r.error.code==="PGRST205"?"The offer database migration is not installed yet.":r.error.message);return '<div class="manager-pagehead"><div><span class="eyebrow">OFFERS</span><h2>Restaurant offers</h2><p>Offers are set by the Manager and applied automatically. Customers cannot enter or edit discounts.</p></div></div><div class="grid catalog-grid"><div class="panel"><h2>Create an offer</h2><form id="offerForm" class="form-grid"><label>Offer name<input id="offerName" required maxlength="120" placeholder="Lunch special"></label><label>Discount type<select id="offerKind"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label><label>Discount value<input id="offerValue" type="number" min="0.01" step="0.01" required></label><label>Description<input id="offerDescription" maxlength="250"></label><div class="full"><button class="primary">Save offer</button><span class="compact-note" id="offerFeedback" aria-live="polite"></span></div></form></div><div class="panel"><h2>Offer rules</h2><p class="muted">Only active offers within their schedule should apply. The checkout service calculates and stores the discount on the order.</p></div></div><div class="panel"><div class="item-list">'+((r.data||[]).length?r.data.map(o=>'<article class="item-card"><div><strong>'+esc(o.name)+'</strong><span>'+esc(o.discount_kind==="percentage"?o.discount_value+"% off":"₹"+o.discount_value+" off")+' · '+(o.active?"Active":"Paused")+'</span><p>'+esc(o.description||"")+'</p></div><button class="mini-btn" data-offer-toggle="'+esc(o.id)+'" data-active="'+(!o.active)+'">'+(o.active?"Pause":"Activate")+'</button></article>').join(""):empty("No offers yet","Create the first offer for this restaurant."))+'</div></div>'}
function bindManagerOffers(id){const form=document.querySelector("#offerForm");if(form)form.onsubmit=async e=>{e.preventDefault();const feedback=document.querySelector("#offerFeedback"),button=e.submitter;button.disabled=true;button.textContent="Saving offer…";const r=await supabase.from("restaurant_offers").insert({business_id:id,name:document.querySelector("#offerName").value.trim(),description:document.querySelector("#offerDescription").value.trim()||null,discount_kind:document.querySelector("#offerKind").value,discount_value:Number(document.querySelector("#offerValue").value),active:true});button.disabled=false;button.textContent="Save offer";feedback.textContent=r.error?r.error.message:"Offer saved.";if(!r.error){managerView(id,"offers");showAppToast("Offer saved.")}};document.querySelectorAll("[data-offer-toggle]").forEach(btn=>btn.onclick=async()=>{const label=btn.textContent;btn.disabled=true;btn.textContent=btn.dataset.active==="true"?"Activating…":"Pausing…";const r=await supabase.from("restaurant_offers").update({active:btn.dataset.active==="true"}).eq("id",btn.dataset.offerToggle).eq("business_id",id);if(r.error){btn.disabled=false;btn.textContent=label;return showAppToast("Could not update offer: "+r.error.message)}await managerView(id,"offers");showAppToast(btn.dataset.active==="true"?"Offer activated.":"Offer paused.")})}
async function managerAutomation(id){const r=await supabase.from("restaurant_settings").select("notify_new_order,notify_customer_status").eq("business_id",id).maybeSingle();if(r.error)return managerModuleSetup("Automation","automation",r.error.code==="PGRST205"?"Automation preferences need the restaurant settings migration.":r.error.message);const s=r.data||{};return '<div class="manager-pagehead"><div><span class="eyebrow">AUTOMATION</span><h2>Notifications</h2><p>Choose the in-app notifications this restaurant wants to use.</p></div></div><div class="panel"><form id="automationForm" class="automation-list"><label><input type="checkbox" id="notifyNewOrder" '+(s.notify_new_order!==false?"checked":"")+'><span><strong>New order alert</strong><small>Show new customer orders on the order desk.</small></span></label><label><input type="checkbox" id="notifyCustomerStatus" '+(s.notify_customer_status!==false?"checked":"")+'><span><strong>Customer status updates</strong><small>Allow the customer menu to show accepted, rejected and delivered order status.</small></span></label><button class="primary">Save notification preferences</button><span id="automationFeedback" class="compact-note" aria-live="polite"></span></form></div>'}
function bindManagerAutomation(id){const form=document.querySelector("#automationForm");if(form)form.onsubmit=async e=>{e.preventDefault();const button=e.submitter,feedback=document.querySelector("#automationFeedback");button.disabled=true;button.textContent="Saving…";const r=await supabase.from("restaurant_settings").upsert({business_id:id,notify_new_order:document.querySelector("#notifyNewOrder").checked,notify_customer_status:document.querySelector("#notifyCustomerStatus").checked},{onConflict:"business_id"});button.disabled=false;button.textContent="Save notification preferences";feedback.textContent=r.error?r.error.message:"Preferences saved."}}

async function workspaceForBusiness(id,knownMembership=null){
  if(!isAdmin()&&knownMembership?.role==="manager")return managerView(id,savedManagerView(id),knownMembership);
  const [bq,mq,mmq]=await Promise.all([
    supabase.from("businesses").select("*").eq("id",id).single(),
    supabase.from("business_members").select("role,display_name,status").eq("business_id",id).eq("user_id",state.user.id).maybeSingle(),
    supabase.from("business_modules").select("module_id,enabled").eq("business_id",id).eq("enabled",true)
  ]);
  if(bq.error)return error(bq.error.message);
  if(mmq.error)return error(mmq.error.message);
  if(!isAdmin() && mq.error)return error(mq.error.message);
  const b=bq.data;
  if(!canOpenBusinessWorkspace(isAdmin(),b.status))return shell("Business unavailable",empty("This business is "+b.status,"Access is unavailable while the business is not active. Contact your platform administrator."));
  const role=isAdmin()?"platform admin":(mq.data?.role||"member");
  const portal=resolvePortal(isAdmin()?"admin":mq.data?.role);
  if(portal==="manager"){
    cacheManagerContext(id,b,mq.data,mmq.data||[]);
    return managerView(id,savedManagerView(id));
  }
  if(portal==="order_taker"||portal==="bill_counter")return renderStaffWorkspace({app,supabase,state,businessId:id,business:b,role:portal,membership:mq.data,esc,shell,empty,showAppToast,managerBill,watchBusinessOrders,showError:error});
  const managerName=role==="manager"?managerWelcomeName(mq.data,state.user):"";
  const active=new Set((mmq.data||[]).map(x=>x.module_id));
  const mods=state.modules.filter(x=>active.has(x.id));

  const moduleCard=m=>{
    const available=isManagerModuleAvailable(m.code);
    const button=available
      ? '<button class="secondary" data-open-catalog="'+esc(id)+'">Open Catalog</button>'
      : '<button class="secondary" disabled>Not available yet</button>';
    return '<div class="feature-card"><span class="feature-icon">◇</span><strong>'+esc(m.name)+'</strong><p>'+esc(m.description||"")+'</p>'+button+'</div>';
  };
  const cards=role==="manager"
    ? groupManagerModules(mods).map(group=>'<section class="module-section"><div class="module-section-head"><h3>'+esc(group.title)+'</h3><p>'+esc(group.description)+'</p></div><div class="grid cards">'+group.modules.map(moduleCard).join("")+'</div></section>').join("")
    : mods.map(moduleCard).join("");

  const staffPanel=role==="manager" ? '<div class="panel staff-access-panel"><div class="panel-head"><div><h2>Team access</h2><p>Create staff sign-ins without requiring an email address.</p></div></div><form id="staffForm" class="form-grid"><label>Staff name<input id="staffName" maxlength="120" required placeholder="Staff name"></label><label>Access type<select id="staffRole"><option value="order_taker">Order Taker</option><option value="bill_counter">Bill Counter</option></select></label><label class="full">Password<input id="staffPassword" type="password" minlength="6" maxlength="72" required placeholder="Create staff password"><small class="compact-note">At least 6 characters. Letters, numbers and symbols are allowed.</small></label><div class="full"><button class="primary">Create staff sign-in</button></div></form><div id="staffFeedback" class="compact-note" aria-live="polite"></div><div class="directory-tools staff-directory-tools"><input id="staffSearch" type="search" placeholder="Search staff by name, role, ID or status" aria-label="Search staff"></div><div class="business-list" id="staffMembers"></div></div>' : "";
  shell(role==="manager"?"Manager dashboard":"Workspace",'<div class="back" id="workspaceBack">← '+(isAdmin()?"Business":"Businesses")+'</div><div class="hero-row"><div><span class="eyebrow">'+esc(typeLabel(b.business_type))+'</span><h2>'+esc(role==="manager"?"Welcome, "+managerName:b.name)+'</h2><p class="muted">'+esc(role==="manager"?b.name+" · "+role+" workspace · "+b.slug:role+" workspace · "+b.slug)+'</p></div><span class="pill active">'+esc(b.status)+'</span></div><div class="grid cards">'+(cards||empty("No modules enabled","A platform administrator needs to enable modules for this business."))+'</div>'+staffPanel);
  document.querySelector("#workspaceBack").onclick=()=>isAdmin()?businessDetail(id):render("businesses");
  document.querySelectorAll("[data-open-catalog]").forEach(x=>x.onclick=()=>catalogView(x.dataset.openCatalog));
  if(role==="manager") loadStaffMembers(id);
}


async function loadStaffMembers(businessId){
  const list=document.querySelector("#staffMembers");
  if(!list)return;
  const result=await supabase.from("business_members").select("user_id,role,display_name,status,staff_login_id,created_at").eq("business_id",businessId).in("role",["order_taker","bill_counter"]).order("created_at",{ascending:true});
  if(result.error){list.innerHTML=empty("Could not load team members",esc(result.error.message));return;}
  const members=result.data||[],search=document.querySelector("#staffSearch"),showRemoved=document.querySelector("#staffShowRemoved");
  const paint=()=>{
    const q=(search?.value||"").trim().toLowerCase();
    const rows=members.filter(m=>(showRemoved?.getAttribute("aria-pressed")==="true"||m.status==="active")&&[m.display_name,m.role.replace("_"," "),m.staff_login_id,m.status==="active"?"active":"removed"].join(" ").toLowerCase().includes(q));
    const removedCount=members.filter(m=>m.status!=="active").length;if(showRemoved)showRemoved.textContent=showRemoved.getAttribute("aria-pressed")==="true"?"Hide removed":"Show removed"+(removedCount?" ("+removedCount+")":"");
    list.innerHTML=rows.length?rows.map(m=>'<div class="business-row staff-member-row"><div class="avatar">'+esc((m.display_name||m.role).slice(0,1).toUpperCase())+'</div><div class="row-main"><strong>'+esc(m.display_name||m.role.replace("_"," "))+'</strong><span>'+esc(m.role.replace("_"," "))+' · Username: '+esc(m.staff_login_id||"Not assigned")+'</span></div><span class="pill '+(m.status==="active"?"active":"suspended")+'">'+(m.status==="active"?"Active":"Removed")+'</span>'+(m.status==="active"?'<button class="mini-btn" data-staff-rename="'+esc(m.user_id)+'">Set name as username</button><button class="mini-btn" data-staff-reset="'+esc(m.user_id)+'" data-staff-name="'+esc(m.display_name||m.role.replace("_"," "))+'" data-staff-id="'+esc(m.staff_login_id||"")+'">'+(m.staff_login_id?"Reset password":"Convert to staff ID")+'</button><button class="mini-btn danger" data-staff-remove="'+esc(m.user_id)+'" data-staff-name="'+esc(m.display_name||m.role.replace("_"," "))+'" data-staff-id="'+esc(m.staff_login_id||"")+'">Remove</button>':"")+'</div>').join(""):empty(q?"No matching staff":"No active staff","Removed staff are kept with their existing records.");
    document.querySelectorAll("[data-staff-rename]").forEach(btn=>btn.onclick=async()=>{if(btn.dataset.confirming!=="true"){btn.dataset.confirming="true";btn.textContent="Confirm change";const cancel=document.createElement("button");cancel.type="button";cancel.className="mini-btn";cancel.textContent="Cancel";cancel.onclick=()=>{btn.dataset.confirming="false";btn.textContent="Set name as username";cancel.remove()};btn.insertAdjacentElement("afterend",cancel);return}btn.disabled=true;btn.textContent="Changing…";const result=await supabase.functions.invoke("manager-staff-access",{body:{action:"rename_username",business_id:businessId,user_id:btn.dataset.staffRename}});if(result.error||result.data?.error){btn.disabled=false;btn.textContent="Set name as username";return showAppToast(result.data?.error||result.error?.message||"Could not change the username.")}document.querySelector("#staffFeedback").textContent="Username updated to "+result.data.staff_login_id+". Share the new username with the staff member.";await loadStaffMembers(businessId)});
    document.querySelectorAll("[data-staff-reset]").forEach(btn=>btn.onclick=()=>{const dialog=document.querySelector("#staffResetDialog"),form=document.querySelector("#staffResetForm"),converting=!btn.dataset.staffId;document.querySelector("#staffResetName").textContent=(converting?"Create staff username for "+btn.dataset.staffName:"Set a new password for "+btn.dataset.staffName+" · "+btn.dataset.staffId);form.dataset.userId=btn.dataset.staffReset;form.dataset.action=converting?"convert_existing":"reset_password";document.querySelector("#staffResetFeedback").textContent="";document.querySelector("#staffResetPassword").value="";dialog.showModal()});
    document.querySelectorAll("[data-staff-remove]").forEach(btn=>btn.onclick=async()=>{
      const actions=btn.parentElement;if(btn.dataset.confirming!=="true"){btn.dataset.confirming="true";btn.textContent="Confirm remove";const cancel=document.createElement("button");cancel.type="button";cancel.className="mini-btn";cancel.textContent="Cancel";cancel.onclick=()=>{btn.dataset.confirming="false";btn.textContent="Remove";cancel.remove()};btn.insertAdjacentElement("afterend",cancel);return}
      const label=btn.dataset.staffName+(btn.dataset.staffId?" ("+btn.dataset.staffId+")":"");
      btn.disabled=true;btn.textContent="Removing…";
      const r=await supabase.functions.invoke("manager-staff-access",{body:{action:"remove_staff",business_id:businessId,user_id:btn.dataset.staffRemove}});
      if(r.error||r.data?.error){btn.disabled=false;btn.textContent="Remove";document.querySelector("#staffFeedback").textContent=r.data?.error||r.error?.message||"Could not remove this staff member.";return}
      document.querySelector("#staffFeedback").textContent=r.data?.warning||"Staff access removed. Existing records are kept.";
      await loadStaffMembers(businessId);
    });
  };
  if(search)search.oninput=paint;if(showRemoved)showRemoved.onclick=()=>{showRemoved.setAttribute("aria-pressed",String(showRemoved.getAttribute("aria-pressed")!=="true"));paint()};
  paint();
  const form=document.querySelector("#staffForm");
  if(!form||form.dataset.bound==="true")return;
  form.dataset.bound="true";
  form.onsubmit=async e=>{
    e.preventDefault();
    const button=form.querySelector("button");const feedback=document.querySelector("#staffFeedback");
    const password=document.querySelector("#staffPassword").value;
    if(!isStaffPassword(password)){feedback.textContent="Use a password with at least 6 characters.";return}
    button.disabled=true;button.textContent="Creating sign-in…";feedback.textContent="";
    const response=await supabase.functions.invoke("manager-staff-access",{body:{action:"create",business_id:businessId,display_name:document.querySelector("#staffName").value.trim(),role:document.querySelector("#staffRole").value,password}});
    button.disabled=false;button.textContent="Create staff sign-in";
    if(response.error||response.data?.error){feedback.textContent=response.data?.error||response.error?.message||"Could not create this staff sign-in.";return;}
    const roleName=document.querySelector("#staffRole").selectedOptions[0].textContent;
    form.reset();feedback.innerHTML='Created '+esc(roleName)+' sign-in · Username <strong>'+esc(response.data.staff_login_id)+'</strong> · password <strong>'+esc(password)+'</strong>. Share these once with the staff member.';await loadStaffMembers(businessId);
  };
  const cancel=document.querySelector("#cancelStaffReset");if(cancel)cancel.onclick=()=>document.querySelector("#staffResetDialog").close();
  const resetForm=document.querySelector("#staffResetForm");if(resetForm&&!resetForm.dataset.bound){resetForm.dataset.bound="true";resetForm.onsubmit=async e=>{e.preventDefault();const password=document.querySelector("#staffResetPassword").value,feedback=document.querySelector("#staffResetFeedback"),button=e.submitter;if(!isStaffPassword(password)){feedback.textContent="Use a password with at least 6 characters.";return}button.disabled=true;button.textContent="Saving…";const r=await supabase.functions.invoke("manager-staff-access",{body:{action:resetForm.dataset.action||"reset_password",business_id:businessId,user_id:resetForm.dataset.userId,password}});button.disabled=false;button.textContent="Save new password";if(r.error||r.data?.error){feedback.textContent=r.data?.error||r.error?.message||"Could not reset this password.";return}document.querySelector("#staffResetDialog").close();document.querySelector("#staffFeedback").textContent=resetForm.dataset.action==="convert_existing"?"Staff username created: "+r.data.staff_login_id+" · Share it and the new password directly with the staff member.":"Password reset. Share the new password directly with the staff member.";await loadStaffMembers(businessId)}};
  document.querySelectorAll("[data-password-toggle]").forEach(button=>{button.onclick=()=>{const input=document.getElementById(button.dataset.passwordToggle),show=input.type==="password";input.type=show?"text":"password";button.setAttribute("aria-label",show?"Hide password":"Show password");button.setAttribute("aria-pressed",String(show))}});
}
async function catalogView(id,editItemId=null,editCategoryId=null,expectedEpoch=null,managerContext=null){
  const viewEpoch=expectedEpoch??managerNavigation.begin();
  const [bq,cq,iq]=await Promise.all([
    managerContext?Promise.resolve({data:managerContext.business,error:null}):supabase.from("businesses").select("id,name,business_type,slug").eq("id",id).single(),
    supabase.from("catalog_categories").select("*").eq("business_id",id).order("sort_order").order("name"),
    supabase.from("catalog_items").select("*").eq("business_id",id).order("created_at",{ascending:false})
  ]);
  if(!managerNavigation.isCurrent(viewEpoch))return;
  if(bq.error)return error(bq.error.message);
  if(cq.error)return error(cq.error.message);
  if(iq.error)return error(iq.error.message);

  const b=bq.data,categories=cq.data||[],items=iq.data||[];
  const editCategory=categories.find(x=>x.id===editCategoryId)||null;
  const editItem=items.find(x=>x.id===editItemId)||null;
  const activeCategories=categories.filter(x=>x.active);
  const catName=idv=>(categories.find(x=>x.id===idv)?.name)||"Uncategorized";

  const catalogMarkup='<div class="back" id="catalogBack">← Workspace</div><div class="hero-row"><div><span class="eyebrow">Catalog</span><h2>'+esc(b.name)+'</h2><p class="muted">'+(b.business_type==="restaurant"?"Food and menu items for this business.":"Products and services for this business.")+'</p></div><span class="pill active">'+esc(typeLabel(b.business_type))+'</span></div><div class="catalog-grid"><div class="panel"><div class="panel-head"><div><h2>'+((editCategory)?"Edit category":"Add category")+'</h2><p>Use categories to organize the catalog.</p></div></div><form id="categoryForm" class="form-grid"><label>Category name<input id="categoryName" required value="'+esc(editCategory?.name||"")+'" placeholder="Example: Main Course"></label><label>Sort order<input id="categorySort" type="number" value="'+esc(editCategory?.sort_order??0)+'" min="0"></label><div class="full"><button class="primary">'+((editCategory)?"Save category":"Add category")+'</button>'+((editCategory)?'<button type="button" class="secondary" id="cancelCategory">Cancel</button>':"")+'</div></form><div class="business-list compact-list">'+(categories.length?categories.map(c=>'<div class="business-row category-row"><div class="avatar">C</div><div class="row-main"><strong>'+esc(c.name)+'</strong><span>Order '+esc(c.sort_order)+'</span></div><span class="pill '+(c.active?"active":"archived")+'">'+(c.active?"Active":"Archived")+'</span><button class="mini-btn" data-edit-category="'+esc(c.id)+'">Edit</button></div>').join(""):empty("No categories","Create your first category."))+'</div></div><div class="panel"><div class="panel-head"><div><h2>'+((editItem)?"Edit catalog item":"Add catalog item")+'</h2><p>For restaurants, choose Food for dishes and drinks.</p></div></div><form id="itemForm" class="form-grid"><label>Name<input id="itemName" required value="'+esc(editItem?.name||"")+'" placeholder="Example: Gold Ring"></label><label>Type<select id="itemType"><option value="food" '+(editItem?.item_type==="food"||(!editItem&&b.business_type==="restaurant")?"selected":"")+'>Food</option><option value="product" '+(editItem?.item_type==="product"||(!editItem&&b.business_type!=="restaurant")?"selected":"")+'>Product</option><option value="service" '+(editItem?.item_type==="service"?"selected":"")+'>Service</option></select></label><label>Category<select id="itemCategory"><option value="">Uncategorized</option>'+activeCategories.map(c=>'<option value="'+esc(c.id)+'" '+(editItem?.category_id===c.id?"selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select></label><label>Price<input id="itemPrice" type="number" min="0" step="0.01" value="'+esc(editItem?.price??"")+'" placeholder="0"></label><label class="full">Image URL<input id="itemImage" type="url" value="'+esc(editItem?.image_url||"")+'" placeholder="https://..."></label><label class="full">Upload product photo<input id="itemImageFile" type="file" accept="image/jpeg,image/png,image/webp"><small class="compact-note">Optional · JPG, PNG or WebP · up to 8 MB.</small></label><label class="full">Description<textarea id="itemDescription" rows="3" placeholder="Short description"></textarea></label><label class="check-line"><input id="itemActive" type="checkbox" '+(editItem?.active!==false?"checked":"")+'><span>Active</span></label><div class="full"><button class="primary">'+((editItem)?"Save item":"Add item")+'</button>'+((editItem)?'<button type="button" class="secondary" id="cancelItem">Cancel</button>':"")+'</div></form></div></div><div class="panel"><div class="panel-head"><div><h2>Catalog items</h2><p>'+esc(String(items.length))+' item(s)</p></div></div><div class="item-list">'+(items.length?items.map(it=>'<article class="item-card"><div><strong>'+esc(it.name)+'</strong><span>'+esc(it.item_type)+' · '+esc(catName(it.category_id))+'</span><p>'+esc(it.description||"")+'</p></div><div class="item-meta"><strong>₹'+esc(it.price??"0")+'</strong><span class="pill '+(it.active?"active":"archived")+'">'+(it.active?"Active":"Archived")+'</span><div class="mini-actions"><button class="mini-btn" data-edit-item="'+esc(it.id)+'">Edit</button><button class="mini-btn" data-toggle-item="'+esc(it.id)+'">'+(it.active?"Archive":"Activate")+'</button></div></div></article>').join(""):empty("No catalog items","Add your first product or service above."))+'</div></div>';
  if(isAdmin())shell("Catalog",catalogMarkup);
  else{
    const context=managerContext||currentManagerContext(id);
    if(!context||!["manager","admin"].includes(context.membership?.role)){
      return error("Manager access could not be verified. Your workspace remains open; ask the platform administrator to confirm your access.");
    }
    const target=document.querySelector(".manager-content");
    if(!target)return;
    target.innerHTML=catalogMarkup.replace("← Workspace","← Overview");
  }

  const setText=(idv,value)=>{const el=document.querySelector(idv);if(el)el.value=value||""};
  setText("#itemDescription",editItem?.description||"");
  document.querySelector("#catalogBack").onclick=()=>isAdmin()?workspaceForBusiness(id):managerView(id,"overview");
  const jumpToEditor=selector=>requestAnimationFrame(()=>document.querySelector(selector)?.scrollIntoView({behavior:"smooth",block:"center"}));
  if(editItem)jumpToEditor("#itemForm");
  if(editCategory)jumpToEditor("#categoryForm");

  document.querySelector("#categoryForm").onsubmit=async e=>{
    e.preventDefault();
    const button=e.submitter,label=editCategory?"Save category":"Add category";button.disabled=true;button.textContent=editCategory?"Saving…":"Creating…";
    const payload={business_id:id,name:document.querySelector("#categoryName").value.trim(),sort_order:Number(document.querySelector("#categorySort").value)||0,active:true};
    const r=editCategory
      ? await supabase.from("catalog_categories").update(payload).eq("id",editCategory.id)
      : await supabase.from("catalog_categories").insert(payload);
    if(r.error){button.disabled=false;button.textContent=label;return showAppToast("Could not save category: "+r.error.message)}
    await catalogView(id);showAppToast(editCategory?"Category updated.":"Category created.");
  };
  if(document.querySelector("#cancelCategory"))document.querySelector("#cancelCategory").onclick=()=>catalogView(id);

  document.querySelector("#itemForm").onsubmit=async e=>{
    e.preventDefault();
    const form=e.currentTarget,saveButton=form.querySelector("button:not([type=button])"),originalLabel=saveButton?.textContent;
    const restoreButton=()=>{if(saveButton){saveButton.disabled=false;saveButton.textContent=originalLabel}};
    if(saveButton){saveButton.disabled=true;saveButton.textContent="Saving item…"}
    const photo=document.querySelector("#itemImageFile").files?.[0];let imageUrl=document.querySelector("#itemImage").value.trim()||editItem?.image_url||null;if(photo){if(!["image/jpeg","image/png","image/webp"].includes(photo.type)||photo.size>8*1024*1024){restoreButton();return alert("Choose a JPG, PNG or WebP image under 8 MB.")}if(saveButton)saveButton.textContent="Uploading photo…";const objectPath=id+"/products/"+crypto.randomUUID()+"-"+photo.name.replace(/[^a-zA-Z0-9._-]/g,"-");let upload;try{upload=await supabase.storage.from("digital-menu-media").upload(objectPath,photo,{contentType:photo.type,upsert:false})}catch(error){restoreButton();return alert("Photo upload failed: "+error.message)}if(upload.error){restoreButton();return alert("Photo upload failed: "+upload.error.message)}imageUrl=supabase.storage.from("digital-menu-media").getPublicUrl(objectPath).data.publicUrl;}
    const payload={business_id:id,name:document.querySelector("#itemName").value.trim(),description:document.querySelector("#itemDescription").value.trim()||null,item_type:document.querySelector("#itemType").value,category_id:document.querySelector("#itemCategory").value||null,price:document.querySelector("#itemPrice").value===""?null:Number(document.querySelector("#itemPrice").value),currency:"INR",image_url:imageUrl,active:document.querySelector("#itemActive").checked};
    const r=editItem
      ? await supabase.from("catalog_items").update(payload).eq("id",editItem.id)
      : await supabase.from("catalog_items").insert(payload);
    if(r.error){restoreButton();return alert(r.error.message)}
    await catalogView(id);showAppToast(editItem?"Product updated.":"Product added.");
  };
  if(document.querySelector("#cancelItem"))document.querySelector("#cancelItem").onclick=()=>catalogView(id);

  document.querySelectorAll("[data-edit-item]").forEach(btn=>btn.onclick=()=>catalogView(id,btn.dataset.editItem,null));
  document.querySelectorAll("[data-edit-category]").forEach(btn=>btn.onclick=()=>catalogView(id,null,btn.dataset.editCategory));
  document.querySelectorAll("[data-toggle-item]").forEach(btn=>btn.onclick=async()=>{
    const it=items.find(x=>x.id===btn.dataset.toggleItem);if(!it)return;const label=btn.textContent;btn.disabled=true;btn.textContent=it.active?"Archiving…":"Activating…";
    const r=await supabase.from("catalog_items").update({active:!it.active}).eq("id",it.id);
    if(r.error){btn.disabled=false;btn.textContent=label;return showAppToast("Could not update item: "+r.error.message)}
    await catalogView(id);showAppToast(it.active?"Product archived.":"Product activated.");
  });
}

function error(m){
  const managerContent=document.querySelector(".manager-content");
  if(managerContent&&app.dataset.managerBusinessId){
    const businessId=app.dataset.managerBusinessId,view=app.dataset.managerView||"overview";
    managerContent.innerHTML='<div class="notice" role="alert"><strong>This section could not be loaded.</strong><p>'+esc(m)+'</p><button class="secondary" id="managerSectionRetry">Retry</button></div>';
    document.querySelector("#managerSectionRetry")?.addEventListener("click",()=>navigateManager(businessId,view),{once:true});
    return;
  }
  app.innerHTML='<main class="auth-page"><div class="auth-card"><h1>Something went wrong</h1><p class="muted">'+esc(m)+'</p><button class="primary" onclick="location.reload()">Retry</button></div></main>';
}
async function load(){
  const u=await supabase.auth.getUser();state.user=u.data.user;if(!state.user)return login();
  if(state.user.app_metadata?.must_change_password){renderFirstLoginPassword({app,supabase,boot,esc});return}
  if(isAdmin()){
    try{const dashboard=await loadSuperAdminDashboardData(supabase);state.businesses=dashboard.businesses;state.modules=dashboard.modules;state.memberCount=dashboard.memberCount}catch(error){return error(error.message)}
  }else{
    // Non-admin portals fetch only the data their own workspace requires.
    // Manager module metadata is loaded after its shell is mounted.
    state.modules=[];
  }
}
function boot(){
  if(bootPromise)return bootPromise;
  bootPromise=(async()=>{
    await load();
    if(!state.user||state.user.app_metadata?.must_change_password){workspaceBooted=true;clearTimeout(workspaceBootTimer);return}
    await render(isAdmin()?"home":"workspace");workspaceBooted=true;clearTimeout(workspaceBootTimer);
  })().finally(()=>{bootPromise=null});
  return bootPromise;
}
function render(v){if(!state.user)return login();if(!isAdmin() && ["home","businesses","modules"].includes(v))return workspace();if(v==="home"){shell("Overview",renderSuperAdminOverview({businesses:state.businesses,memberCount:state.memberCount,modules:state.modules,metric}));document.querySelector("#newBusiness").onclick=createBusiness;const search=document.querySelector("#homeSearch"),status=document.querySelector("#homeStatus"),list=document.querySelector("#homeBusinessList");const paint=()=>{const q=search.value.trim().toLowerCase(),rows=state.businesses.filter(b=>(b.name+" "+b.slug+" "+b.business_type).toLowerCase().includes(q)&&(status.value==="all"||b.status===status.value));list.innerHTML=rows.length?rows.map(row).join(""):empty("No matching businesses","Try another search or filter.");document.querySelectorAll("[data-business]").forEach(x=>x.onclick=()=>businessDetail(x.dataset.business))};search.oninput=paint;status.onchange=paint;paint();return}if(v==="businesses")return businesses();if(v==="modules")return modules();return workspace()}
supabase.auth.onAuthStateChange((event,s)=>{
  if(customerMenuMode)return;
  // OTP verification creates a temporary session. Keep the recovery UI in control
  // until the password is changed and signOut completes; never boot the dashboard mid-recovery.
  if(app.dataset.authFlow === "recovery" && event !== "SIGNED_OUT") return;
  // Sign-in handlers and the initial page load call boot() themselves. Refreshing
  // an access token must not rebuild the workspace or reset the Manager to Overview.
  if(event==="SIGNED_OUT"){stopOrderWatch();managerNavigation.invalidate();managerContexts.clear();state.user=null;login()}
});
if(!customerMenuMode){app.innerHTML='<main class="auth-page" role="status"><div class="auth-card"><div class="brand center"><strong>DIGITAL VISION</strong><small>BY ATELIER OG</small></div><p class="muted">Loading your workspace…</p></div></main>';workspaceBootTimer=setTimeout(()=>{if(workspaceBooted)return;if(state.user)errorScreen("Your workspace is taking longer than expected. Check your connection and try again.");else login("We couldn’t verify your sign-in. Please sign in again.")},12000)}
if(customerMenuMode)bootCustomerMenu({app,esc,supabaseUrl:SUPABASE_URL,supabaseKey:SUPABASE_KEY,statusPollIntervalMs:CUSTOMER_STATUS_POLL_INTERVAL_MS});else boot().catch(()=>{workspaceBooted=true;clearTimeout(workspaceBootTimer);errorScreen("We couldn’t open your workspace. Check your connection and try again.")});

function errorScreen(message){
  if(document.querySelector(".manager-shell")){
    const content=document.querySelector(".manager-content");
    if(content){content.innerHTML=managerInlineError("Manager workspace",new Error(message));document.querySelector("#managerRouteRetry")?.addEventListener("click",()=>navigateManager(app.dataset.managerBusinessId,app.dataset.managerView||"overview"),{once:true})}
    return;
  }
  app.innerHTML='<main class="auth-page"><div class="auth-card"><div class="brand center"><strong>DIGITAL VISION</strong><small>BY ATELIER OG</small></div><h1>Workspace unavailable</h1><p class="muted">'+esc(message)+'</p><button class="primary" id="retryWorkspace">Try again</button></div></main>';
  document.querySelector("#retryWorkspace").onclick=()=>{document.querySelector("#retryWorkspace").disabled=true;document.querySelector("#retryWorkspace").textContent="Connecting…";boot().catch(()=>errorScreen(message))};
}

