import { renderLogin, renderFirstLoginPassword } from "./src/auth/login.js";
import { createBusinessId } from "./src/manager/business-id.mjs";
import { canOpenBusinessWorkspace } from "./src/manager/business-access.mjs";
import { managerWelcomeName } from "./src/manager/welcome-name.mjs";
import { groupManagerModules, isManagerModuleAvailable } from "./src/manager/module-dashboard.mjs";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://qwyquvufneolyesfiipf.supabase.co";
const SUPABASE_KEY = "sb_publishable_P-N6bQR54Ui4idQahqQwdg_U9l6xz39";
const managerLoginMode = new URLSearchParams(window.location.search).get("login") === "manager";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, managerLoginMode ? { auth: { storageKey: "digital-vision-manager-auth" } } : {});
const app = document.querySelector("#app");
const state = { user:null, businesses:[], modules:[] };

const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const typeLabel = t => ({restaurant:"Restaurant",retail:"Retail",jewellery:"Jewellery",clothing:"Clothing",salon:"Salon",services:"Services",other:"Other"}[t]||t);
const isAdmin = () => state.user?.app_metadata?.role === "admin";

function login(message=""){renderLogin({app,supabase,boot,esc},message)}

function shell(title,content){
  app.innerHTML='<div class="app-shell"><aside class="sidebar"><div class="brand"><strong>DIGITAL VISION</strong><small>BY ATELIER OG</small></div><nav>'+ (isAdmin() ? '<button data-view="home">Overview</button><button data-view="businesses">Businesses</button><button data-view="modules">Modules</button>' : '<button data-view="workspace">Workspace</button>') +'</nav><button id="signout" class="ghost">Sign out</button></aside><main class="main"><header class="topbar"><div><small>DIGITAL VISION</small><h1>'+esc(title)+'</h1></div><span class="status-dot">● Connected</span></header><section class="content">'+content+'</section><nav class="mobile-nav">'+(isAdmin() ? '<button data-view="home"><span>⌂</span><small>Overview</small></button><button data-view="businesses"><span>▦</span><small>Businesses</small></button><button data-view="modules"><span>◇</span><small>Modules</small></button>' : '<button data-view="workspace"><span>⌂</span><small>Workspace</small></button>')+'<button id="mobileMore"><span>↪</span><small>Sign out</small></button></nav></main></div>';
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>render(b.dataset.view));
  const signout=document.querySelector("#signout");
  signout.onclick=async()=>{await supabase.auth.signOut();login()};
  document.querySelector("#mobileMore").onclick=()=>signout.click();
}
const metric=(a,b,c)=>'<div class="metric"><small>'+esc(a)+'</small><strong>'+esc(b)+'</strong><span>'+esc(c)+'</span></div>';
const empty=(a,b)=>'<div class="empty"><strong>'+esc(a)+'</strong><span>'+esc(b)+'</span></div>';
const row=b=>'<button class="business-row" data-business="'+b.id+'"><div class="avatar">'+esc(b.name.slice(0,1).toUpperCase())+'</div><div class="row-main"><strong>'+esc(b.name)+'</strong><span>'+esc(typeLabel(b.business_type))+' · '+esc(b.slug)+'</span></div><span class="pill '+b.status+'">'+esc(b.status)+'</span><span class="arrow">→</span></button>';

function overview(){
  return '<div class="grid metrics">'+metric("Businesses",state.businesses.length,"")+metric("Active",state.businesses.filter(b=>b.status==="active").length,"")+metric("Members",state.memberCount??"—","")+metric("Modules",state.modules.length,"")+'</div><div class="panel"><div class="panel-head"><h2>Businesses</h2><button class="primary" id="newBusiness">+ Create business</button></div><div class="directory-tools"><input id="homeSearch" type="search" placeholder="Search businesses"><select id="homeStatus"><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></div><div class="business-list" id="homeBusinessList"></div></div>';
}
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
  const types=["restaurant","retail","jewellery","clothing","salon","services","other"];
  let body="";
  if(step===1)body='<div class="stepper"><span class="current">Details</span><span>Modules</span><span>Manager</span><span>Review</span></div><form id="businessForm" class="form-grid"><label>Business name<input id="bname" required maxlength="120" value="'+esc(draft.name||"")+'" placeholder="Business name"></label><label>Business type<select id="btype">'+types.map(x=>'<option value="'+x+'" '+(draft.business_type===x?"selected":"")+'>'+typeLabel(x)+'</option>').join("")+'</select></label><label class="full">Business ID<input id="bslug" required pattern="[a-z0-9-]+" maxlength="80" value="'+esc(createBusinessId(draft.name||"",state.businesses))+'" placeholder="business-name" readonly><small class="compact-note">Automatically filled from the business name.</small></label><div class="full"><button class="primary">Continue</button><button type="button" class="secondary" id="cancel">Cancel</button></div></form>';
  if(step===2)body='<div class="stepper"><span>Details</span><span class="current">Modules</span><span>Manager</span><span>Review</span></div><form id="moduleForm"><div class="module-grid">'+(state.modules.length?state.modules.map(m=>'<label class="module-card"><input type="checkbox" name="module" value="'+esc(m.id)+'" '+((draft.modules||[]).includes(m.id)?"checked":"")+'><span><strong>'+esc(m.name)+'</strong></span></label>').join(""):'<p class="compact-note">No modules are available yet. Please refresh the page or contact the platform administrator.</p>')+'</div><div class="form-actions"><button type="button" class="secondary" id="prev">Back</button><button class="primary">Continue</button></div></form>';
  if(step===3)body='<div class="stepper"><span>Details</span><span>Modules</span><span class="current">Manager</span><span>Review</span></div><form id="managerForm" class="form-grid"><label class="full">Manager email<input id="managerEmail" type="email" required value="'+esc(draft.managerEmail||"")+'" placeholder="manager@business.com"></label><label class="full">Manager name<input id="managerName" required maxlength="120" value="'+esc(draft.managerName||"")+'" placeholder="Manager name"></label><div class="full"><p class="compact-note">Login ID, temporary password and login link will be emailed. A password change is required at first sign-in.</p><button type="button" class="secondary" id="prev">Back</button><button class="primary">Continue</button></div></form>';
  if(step===4)body='<div class="stepper"><span>Details</span><span>Modules</span><span>Manager</span><span class="current">Review</span></div><div class="review-list"><div><small>Business</small><strong>'+esc(draft.name||"")+'</strong></div><div><small>Business ID</small><strong>'+esc(draft.slug||"")+'</strong></div><div><small>Modules</small><strong>'+esc((draft.modules||[]).map(id=>state.modules.find(m=>m.id===id)?.name).filter(Boolean).join(", ")||"None")+'</strong></div><div><small>Manager</small><strong>'+esc(draft.managerEmail||"")+'</strong></div></div><div class="form-actions"><button class="secondary" id="prev">Back</button><button class="primary" id="finishBusiness">Create business</button></div>';
  shell("Create business",'<div class="panel narrow"><div class="panel-head"><h2>New business</h2></div>'+body+'</div>');
  const setDraft=patch=>app.dataset.businessDraft=JSON.stringify({...draft,...patch}),go=n=>{app.dataset.createStep=String(n);createBusiness()};
  const cancel=document.querySelector("#cancel");if(cancel)cancel.onclick=()=>{delete app.dataset.createStep;delete app.dataset.businessDraft;render("businesses")};
  const prev=document.querySelector("#prev");if(prev)prev.onclick=()=>go(step-1);
  const bf=document.querySelector("#businessForm");if(bf){const nameInput=document.querySelector("#bname"),idInput=document.querySelector("#bslug");nameInput.oninput=()=>{idInput.value=createBusinessId(nameInput.value,state.businesses)};bf.onsubmit=e=>{e.preventDefault();setDraft({name:nameInput.value.trim(),slug:idInput.value.trim(),business_type:document.querySelector("#btype").value});go(2)}};
  const mf=document.querySelector("#moduleForm");if(mf)mf.onsubmit=e=>{e.preventDefault();setDraft({modules:[...document.querySelectorAll('input[name="module"]:checked')].map(x=>x.value)});go(3)};
  const mgr=document.querySelector("#managerForm");if(mgr)mgr.onsubmit=e=>{e.preventDefault();setDraft({managerEmail:document.querySelector("#managerEmail").value.trim().toLowerCase(),managerName:document.querySelector("#managerName").value.trim()});go(4)};
  const finish=document.querySelector("#finishBusiness");if(finish)finish.onclick=async()=>{finish.disabled=true;finish.textContent="Creating...";const d=JSON.parse(app.dataset.businessDraft||"{}");const cr=await supabase.from("businesses").insert({name:d.name,business_type:d.business_type,slug:d.slug}).select().single();if(cr.error){finish.disabled=false;finish.textContent="Create business";return alert(cr.error.message)}const b=cr.data;
    if(d.modules?.length){const mr=await supabase.from("business_modules").upsert(d.modules.map(module_id=>({business_id:b.id,module_id,enabled:true})),{onConflict:"business_id,module_id"});if(mr.error){await supabase.from("businesses").delete().eq("id",b.id);finish.disabled=false;finish.textContent="Create business";return alert(mr.error.message)}}
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
  const [mods,members]=await Promise.all([
    supabase.from("business_modules").select("module_id,enabled").eq("business_id",id),
    supabase.from("business_members").select("id,user_id,role,display_name,status,created_at").eq("business_id",id).order("created_at",{ascending:true})
  ]);
  if(mods.error)return alert(mods.error.message);
  if(members.error)return alert(members.error.message);
  const enabled=new Set((mods.data||[]).filter(x=>x.enabled).map(x=>x.module_id));
  shell("Business",'<div class="back" id="back">← Businesses</div><div class="hero-row"><div><span class="eyebrow">'+esc(typeLabel(b.business_type))+'</span><h2>'+esc(b.name)+'</h2><p class="muted">'+esc(b.slug)+' · '+esc(b.status)+'</p></div><div class="hero-actions"><span class="pill '+b.status+'">'+esc(b.status)+'</span><button class="secondary" id="openWorkspace">Open workspace</button><button class="secondary" id="businessStatusAction">'+(b.status==="active"?"Suspend":b.status==="suspended"?"Activate":"Reactivate")+'</button><button class="secondary" id="archiveBusiness">Archive</button><button class="secondary" id="deleteBusiness">Delete permanently</button></div></div><div class="panel"><div class="panel-head"><div><h2>Business information</h2></div></div><div class="info-grid"><div><small>Business ID</small><strong>'+esc(b.slug)+'</strong></div><div><small>Type</small><strong>'+esc(typeLabel(b.business_type))+'</strong></div><div><small>Created</small><strong>'+esc(b.created_at?new Date(b.created_at).toLocaleDateString():"—")+'</strong></div></div></div><div class="panel"><div class="panel-head"><div><h2>Module access</h2><p>Enable only what this business needs.</p></div><button class="primary" id="save">Save access</button></div><div class="module-grid">'+state.modules.map(m=>'<label class="module-card"><input type="checkbox" value="'+m.id+'" '+(enabled.has(m.id)?"checked":"")+'><span><strong>'+esc(m.name)+'</strong><small>'+esc(m.description||"")+'</small></span></label>').join("")+'</div></div>');
  document.querySelector("#back").onclick=()=>render("businesses");
  document.querySelector("#openWorkspace").onclick=()=>workspaceForBusiness(id);
  const performBusinessAction=async(action)=>{
    const labels={suspend:"suspend this business",activate:"activate this business",archive:"archive this business",delete:"permanently delete this business"};
    if(!confirm("Are you sure you want to "+labels[action]+"?"+(action==="delete"?" This cannot be undone.":"")))return;
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
  document.querySelector("#save").onclick=async()=>{
    const ids=[...document.querySelectorAll(".module-card input:checked")].map(x=>x.value);
    const del=await supabase.from("business_modules").delete().eq("business_id",id);
    if(del.error)return alert(del.error.message);
    if(ids.length){const ins=await supabase.from("business_modules").insert(ids.map(module_id=>({business_id:id,module_id,enabled:true})));if(ins.error)return alert(ins.error.message)}
    alert("Module access saved.");
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
  if(r.data.length===1)return workspaceForBusiness(r.data[0].business_id);
  const ids=r.data.map(x=>x.business_id);
  const bq=await supabase.from("businesses").select("*").in("id",ids).order("name");
  if(bq.error)return error(bq.error.message);
  shell("Choose business",'<div class="panel"><div class="panel-head"><div><h2>Your businesses</h2><p>Select the business workspace you want to open.</p></div></div><div class="business-list">'+(bq.data||[]).map(b=>row(b)).join("")+'</div></div>');
  document.querySelectorAll("[data-business]").forEach(x=>x.onclick=()=>workspaceForBusiness(x.dataset.business));
}

const managerNav=[
  ["overview","Overview",null], ["catalog","Menu & products","catalog"], ["digital_page","Digital menu","digital_page"],
  ["qr","Tables & QR","qr"], ["ordering","Orders & bills","ordering"], ["offers","Offers","offers"],
  ["customers","Customers","customers"], ["inquiries","Inquiries","inquiries"], ["analytics","Reports","analytics"], ["automation","Automation","automation"],
  ["team","Team access",null]
];

async function managerView(id,view="overview"){
  const [business,membership,enabledRows]=await Promise.all([
    supabase.from("businesses").select("id,name,business_type,slug,status").eq("id",id).single(),
    supabase.from("business_members").select("role,display_name,status").eq("business_id",id).eq("user_id",state.user.id).maybeSingle(),
    supabase.from("business_modules").select("module_id,enabled").eq("business_id",id).eq("enabled",true)
  ]);
  if(business.error)return error(business.error.message);
  if(membership.error)return error(membership.error.message);
  if(enabledRows.error)return error(enabledRows.error.message);
  if(!isAdmin() && membership.data?.role!=="manager")return workspace();
  if(!canOpenBusinessWorkspace(isAdmin(),business.data.status))return error("This business is not active.");
  const enabledIds=new Set((enabledRows.data||[]).map(x=>x.module_id));
  const enabledCodes=new Set(state.modules.filter(x=>enabledIds.has(x.id)).map(x=>x.code));
  const name=managerWelcomeName(membership.data,state.user);
  const title=managerNav.find(x=>x[0]===view)?.[1]||"Overview";
  const available=(page,module)=>!module||enabledCodes.has(module);
  const allowed=managerNav.some(([key,,module])=>key===view&&available(key,module));
  if(!allowed)return managerView(id,"overview");
  let content="";
  if(view==="overview")content=await managerOverview(id,business.data,name,enabledCodes);
  else if(view==="catalog")return catalogView(id);
  else if(view==="ordering")content=await managerOrders(id);
  else if(view==="customers")content=await managerCustomers(id);
  else if(view==="inquiries")content=await managerInquiries(id);
  else if(view==="analytics")content=await managerReports(id);
  else if(view==="team")content=managerTeamContent(id);
  else content=managerModuleSetup(title,view);
  const nav=managerNav.filter(([key,,module])=>available(key,module)).map(([key,label])=>'<button class="manager-nav '+(view===key?'active':'')+'" data-manager-view="'+key+'"><span>'+managerIcon(key)+'</span>'+esc(label)+(key==="ordering"?'<small class="manager-count" id="pendingCount"></small>':"")+'</button>').join("");
  const b=business.data;
  app.innerHTML='<div class="manager-shell"><aside class="manager-sidebar"><div class="brand"><strong>DIGITAL VISION</strong><small>BY ATELIER OG</small></div><div class="manager-business"><small>YOUR BUSINESS</small><strong>'+esc(b.name)+'</strong><span>'+esc(typeLabel(b.business_type))+' · '+esc(b.slug)+'</span></div><nav>'+nav+'</nav><button id="managerSignout" class="ghost">Sign out</button></aside><main class="manager-main"><header class="manager-top"><div><small>'+esc(b.name)+' / MANAGER</small><h1>'+esc(title)+'</h1></div><span class="manager-connected">● Connected</span></header><section class="manager-content">'+content+'</section><nav class="manager-mobile-nav">'+managerNav.filter(([key,,module])=>available(key,module)&&["overview","catalog","ordering","analytics","team"].includes(key)).map(([key,label])=>'<button class="'+(view===key?'active':'')+'" data-manager-view="'+key+'"><span>'+managerIcon(key)+'</span><small>'+esc(label==="Orders & bills"?"Orders":label==="Menu & products"?"Menu":label)</small></button>').join("")+'</nav></main></div>';
  document.querySelectorAll("[data-manager-view]").forEach(el=>el.onclick=()=>managerView(id,el.dataset.managerView));
  document.querySelector("#managerSignout").onclick=async()=>{await supabase.auth.signOut();login()};
  if(view==="team")bindManagerStaff(id);
  if(view==="ordering")bindManagerOrders(id);
  if(view==="inquiries")bindManagerInquiries(id);
  if(view==="analytics")bindManagerReports(id);
}

function managerIcon(key){return ({overview:"◫",catalog:"▤",digital_page:"◉",qr:"▦",ordering:"▣",offers:"✦",customers:"♙",inquiries:"⌕",analytics:"▥",automation:"⚙",team:"♙"})[key]||"◇"}
function managerModuleSetup(title,key){
  const text={digital_page:"Set your restaurant name, description, logo, menu cover and customer-facing theme. Preview the menu before you publish it.",qr:"Create one QR code per table. Guests scan it to open the menu already set to their table.",offers:"Set a restaurant offer. The system will calculate eligible discounts automatically; guests cannot change the offer.",automation:"Manage in-app order alerts and customer status updates."}[key]||"This module is available for this business.";
  return '<div class="manager-pagehead"><div><span class="eyebrow">MANAGER WORKSPACE</span><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p></div></div><div class="panel"><div class="empty"><strong>'+esc(title)+' setup is being connected</strong><span>The module is enabled. This screen will use your restaurant data after the menu, table, offer and order foundations are connected.</span></div></div>';
}
function managerTeamContent(){return '<div class="manager-pagehead"><div><span class="eyebrow">STAFF FOR THIS BUSINESS</span><h2>Team access</h2><p>Create and manage only Order Taker and Bill Counter accounts.</p></div></div><div class="panel"><form id="staffForm" class="form-grid"><label>Staff email<input id="staffEmail" type="email" required placeholder="staff@example.com"></label><label>Display name<input id="staffName" maxlength="120" placeholder="Staff name"></label><label>Access type<select id="staffRole"><option value="order_taker">Order Taker</option><option value="bill_counter">Bill Counter</option></select></label><div class="full"><button class="primary">Invite team member</button></div></form><div id="staffFeedback" class="compact-note" aria-live="polite"></div><div id="staffMembers" class="business-list"></div></div>';}
function bindManagerStaff(id){loadStaffMembers(id)}
async function managerOverview(id,b,name,enabled){
  const [orders,catalog,categories,team,orderItems]=await Promise.all([
    enabled.has("ordering")?supabase.from("orders").select("id,status,total,created_at").eq("business_id",id).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
    enabled.has("catalog")?supabase.from("catalog_items").select("id,name,active").eq("business_id",id):Promise.resolve({data:[],error:null}),
    enabled.has("catalog")?supabase.from("catalog_categories").select("id").eq("business_id",id):Promise.resolve({data:[],error:null}),
    supabase.from("business_members").select("user_id,role,display_name,status").eq("business_id",id).in("role",["order_taker","bill_counter"]).eq("status","active"),
    enabled.has("ordering")?supabase.from("order_items").select("item_name,quantity").eq("business_id",id):Promise.resolve({data:[],error:null})
  ]);
  for(const x of [orders,catalog,categories,team,orderItems])if(x.error)return '<div class="notice">Could not load this summary: '+esc(x.error.message)+'</div>';
  const rows=orders.data||[],today=new Date();today.setHours(0,0,0,0);const todays=rows.filter(x=>new Date(x.created_at)>=today);
  const total=todays.reduce((n,x)=>n+Number(x.total||0),0),newOrders=rows.filter(x=>x.status==="new").length;
  const productCounts=new Map();(orderItems.data||[]).forEach(x=>productCounts.set(x.item_name,(productCounts.get(x.item_name)||0)+Number(x.quantity||0)));
  const ranked=[...productCounts].sort((a,b)=>b[1]-a[1]);
  const recent=rows.slice(0,4).map(x=>'<div class="business-row"><div class="avatar">#</div><div class="row-main"><strong>Order '+esc(x.id.slice(0,8).toUpperCase())+'</strong><span>'+esc(x.status)+' · '+esc(new Date(x.created_at).toLocaleString())+'</span></div><span class="pill active">₹'+esc(Number(x.total||0).toFixed(2))+'</span></div>').join("");
  return '<div class="manager-pagehead"><div><span class="eyebrow">'+esc(typeLabel(b.business_type))+' · '+esc(b.slug)+'</span><h2>Welcome, '+esc(name)+'</h2><p>Here is the current activity for '+esc(b.name)+'.</p></div><span class="pill active">'+esc(b.status)+'</span></div><div class="grid metrics manager-metrics">'+metric("Orders today",todays.length,"From live order records")+metric("Waiting for response",newOrders,"New orders")+metric("Active products",(catalog.data||[]).filter(x=>x.active).length,"Across "+(categories.data||[]).length+" categories")+metric("Sales today","₹"+total.toFixed(2),"Calculated from saved orders")+'</div><div class="grid manager-dashgrid"><div class="panel"><div class="section-title"><div><h2>Getting started</h2><p>Set up the customer menu and restaurant workflow.</p></div></div><div class="manager-checklist">'+[['catalog','Add products and categories',enabled.has("catalog")],['digital_page','Add restaurant details and preview the menu',enabled.has("digital_page")],['qr','Create table QR codes',enabled.has("qr")],['offers','Set an offer',enabled.has("offers")],['team','Invite an Order Taker and Bill Counter',true]].map(([key,label,on])=>'<button class="manager-task" data-manager-view="'+(on?key:"overview")+'"><span class="task-check">'+(on?"✓":"•")+'</span><span>'+esc(label)+'</span><span class="task-arrow">→</span></button>').join("")+'</div></div><div class="panel"><div class="section-title"><div><h2>Recent orders</h2><p>Latest activity from this restaurant</p></div><button class="textlink" data-manager-view="ordering">Open orders →</button></div><div class="business-list">'+(recent||empty("No orders yet","New restaurant orders will appear here."))+'</div><div class="popular-items"><strong>Most ordered</strong><span>'+(ranked[0]?esc(ranked[0][0])+" · "+ranked[0][1]+" ordered":"No item history yet")+'</span><strong>Least ordered</strong><span>'+(ranked.length>1?esc(ranked[ranked.length-1][0])+" · "+ranked[ranked.length-1][1]+" ordered":"Not enough orders yet")+'</span></div></div></div><div class="panel" style="margin-top:16px"><div class="section-title"><div><h2>Modules enabled for your business</h2><p>Each available module opens in this workspace.</p></div><span class="pill active">'+enabled.size+' enabled</span></div><div class="grid module-grid">'+state.modules.filter(m=>enabled.has(m.code)).map(m=>'<button class="manager-module-card" data-manager-view="'+esc(m.code==='catalog'?'catalog':m.code)+'"><span>'+managerIcon(m.code)+'</span><strong>'+esc(m.name)+'</strong><small>'+esc(m.description||"")+'</small></button>').join("")+'</div></div>';
}
async function managerOrders(id){
  const {data,error}=await supabase.from("orders").select("id,status,total,currency,created_at,updated_at,customer_id").eq("business_id",id).order("created_at",{ascending:false}).limit(100);
  if(error)return '<div class="notice">Could not load orders: '+esc(error.message)+'</div>';
  const orders=data||[],ids=orders.map(x=>x.id),customerIds=[...new Set(orders.map(x=>x.customer_id).filter(Boolean))];
  const [itemResult,customerResult]=await Promise.all([
    ids.length?supabase.from("order_items").select("order_id,item_name,quantity,unit_price,line_total").eq("business_id",id).in("order_id",ids):Promise.resolve({data:[],error:null}),
    customerIds.length?supabase.from("customers").select("id,name,phone").eq("business_id",id).in("id",customerIds):Promise.resolve({data:[],error:null})
  ]);
  if(itemResult.error)return '<div class="notice">Could not load order items: '+esc(itemResult.error.message)+'</div>';
  const itemsByOrder=new Map(),customersById=new Map((customerResult.data||[]).map(x=>[x.id,x]));
  (itemResult.data||[]).forEach(x=>itemsByOrder.set(x.order_id,[...(itemsByOrder.get(x.order_id)||[]),x]));
  const byStatus={new:0,accepted:0,processing:0,delivered:0};orders.forEach(x=>byStatus[x.status]=(byStatus[x.status]||0)+1);
  return '<div class="manager-pagehead"><div><span class="eyebrow">ORDERING</span><h2>Orders & bills</h2><p>Open an order to review its customer and item details. Status changes are available to authorized staff.</p></div><button class="secondary" data-manager-view="overview">← Dashboard</button></div><div class="grid metrics manager-metrics">'+metric("New",byStatus.new||0,"Needs a response")+metric("Accepted",byStatus.accepted||0,"Being handled")+metric("Delivered",byStatus.delivered||0,"Completed orders")+metric("Total orders",orders.length,"Most recent 100")+'</div><div class="panel"><div class="section-title"><h2>Restaurant orders</h2><span class="compact-note">Item prices shown are saved order snapshots.</span></div><div class="item-list">'+(orders.length?orders.map(x=>{const c=customersById.get(x.customer_id),its=itemsByOrder.get(x.id)||[];return '<article class="item-card order-data-row"><div><strong>Order '+esc(x.id.slice(0,8).toUpperCase())+' · '+esc(c?.name||"Guest")+'</strong><span>'+esc(x.status==="cancelled"?"rejected":x.status)+' · '+esc(new Date(x.created_at).toLocaleString())+(c?.phone?' · '+esc(c.phone):"")+'</span><p>'+esc(its.map(it=>it.item_name+" × "+it.quantity).join(" · ")||"Order item details unavailable")+'</p></div><div class="item-meta"><strong>₹'+esc(Number(x.total||0).toFixed(2))+'</strong><div class="mini-actions"><button class="mini-btn" data-order-detail="'+x.id+'">Open bill</button><button class="mini-btn" data-order-print="'+x.id+'">Print</button>'+(x.status==="new"?'<button class="mini-btn" data-order-status="accepted" data-order-id="'+x.id+'">Accept</button><button class="mini-btn" data-order-status="cancelled" data-order-id="'+x.id+'">Reject</button>':"")+(x.status==="accepted"||x.status==="processing"?'<button class="mini-btn" data-order-status="delivered" data-order-id="'+x.id+'">Mark delivered</button>':"")+'</div></div></article>'}).join(""):empty("No orders found","Customer orders will appear here once ordering is connected."))+'</div></div>';
}
function bindManagerOrders(id){document.querySelectorAll("[data-order-status]").forEach(btn=>btn.onclick=async()=>{const r=await supabase.from("orders").update({status:btn.dataset.orderStatus}).eq("id",btn.dataset.orderId).eq("business_id",id);if(r.error)return alert(r.error.message);managerView(id,"ordering")});document.querySelectorAll("[data-order-detail]").forEach(btn=>btn.onclick=()=>managerBill(id,btn.dataset.orderDetail));document.querySelectorAll("[data-order-print]").forEach(btn=>btn.onclick=()=>managerBill(id,btn.dataset.orderPrint))}
async function managerBill(id,orderId){const [o,i,c]=await Promise.all([supabase.from("orders").select("id,status,total,currency,created_at,customer_id").eq("business_id",id).eq("id",orderId).single(),supabase.from("order_items").select("item_name,quantity,unit_price,line_total").eq("business_id",id).eq("order_id",orderId),supabase.from("businesses").select("name,slug").eq("id",id).single()]);if(o.error||i.error||c.error)return alert((o.error||i.error||c.error).message);const cust=o.data.customer_id?await supabase.from("customers").select("name,phone").eq("business_id",id).eq("id",o.data.customer_id).maybeSingle():{data:null};app.innerHTML='<main class="receipt-page"><button class="secondary receipt-back" id="receiptBack">← Back to orders</button><article class="receipt"><header><span>DIGITAL VISION · '+esc(c.data.name)+'</span><h1>Order bill</h1><p>Business ID: '+esc(c.data.slug)+'</p></header><div class="receipt-meta"><span>Order '+esc(o.data.id.slice(0,8).toUpperCase())+'</span><span>'+esc(new Date(o.data.created_at).toLocaleString())+'</span><span>Status: '+esc(o.data.status)+'</span><span>Customer: '+esc(cust.data?.name||"Guest")+(cust.data?.phone?" · "+esc(cust.data.phone):"")+'</span></div><div class="receipt-items">'+(i.data||[]).map(x=>'<div><span>'+esc(x.item_name)+' × '+esc(x.quantity)+'</span><span>₹'+esc(Number(x.line_total).toFixed(2))+'</span></div>').join("")+'</div><div class="receipt-total"><span>Order total</span><strong>₹'+esc(Number(o.data.total).toFixed(2))+'</strong></div><p class="receipt-note">This is an order bill preview, not a tax invoice. Final tax and payment details will appear after restaurant billing settings are configured.</p><button class="primary" id="printReceipt">Print bill</button></article></main>';document.querySelector("#receiptBack").onclick=()=>managerView(id,"ordering");document.querySelector("#printReceipt").onclick=()=>window.print()}
async function managerCustomers(id){const r=await supabase.from("customers").select("id,name,phone,email,created_at").eq("business_id",id).order("created_at",{ascending:false}).limit(200);if(r.error)return '<div class="notice">'+esc(r.error.message)+'</div>';return '<div class="manager-pagehead"><div><span class="eyebrow">CUSTOMERS</span><h2>Customer list</h2><p>Contact details collected through restaurant orders and inquiries.</p></div></div><div class="panel"><div class="business-list">'+((r.data||[]).length?r.data.map(c=>'<div class="business-row"><div class="avatar">'+esc((c.name||"?").slice(0,1).toUpperCase())+'</div><div class="row-main"><strong>'+esc(c.name)+'</strong><span>'+esc(c.phone||c.email||"No contact details")+' · '+esc(new Date(c.created_at).toLocaleDateString())+'</span></div></div>').join(""):empty("No customer records yet","Customers appear here when their details are collected."))+'</div></div>'}
async function managerInquiries(id){const r=await supabase.from("inquiries").select("id,subject,message,status,created_at,customer_id").eq("business_id",id).order("created_at",{ascending:false}).limit(100);if(r.error)return '<div class="notice">'+esc(r.error.message)+'</div>';return '<div class="manager-pagehead"><div><span class="eyebrow">INQUIRIES</span><h2>Customer questions</h2><p>Review questions and mark them open or closed.</p></div></div><div class="panel"><div class="item-list">'+((r.data||[]).length?r.data.map(i=>'<article class="item-card"><div><strong>'+esc(i.subject||"Customer inquiry")+'</strong><span>'+esc(i.status)+' · '+esc(new Date(i.created_at).toLocaleString())+'</span><p>'+esc(i.message)+'</p></div><div class="mini-actions"><button class="mini-btn" data-inquiry-status="'+(i.status==="closed"?"open":"closed")+'" data-inquiry-id="'+i.id+'">Mark '+(i.status==="closed"?"open":"closed")+'</button></div></article>').join(""):empty("No inquiries yet","Customer questions will appear here."))+'</div></div>'}
function bindManagerInquiries(id){document.querySelectorAll("[data-inquiry-status]").forEach(btn=>btn.onclick=async()=>{const r=await supabase.from("inquiries").update({status:btn.dataset.inquiryStatus}).eq("id",btn.dataset.inquiryId).eq("business_id",id);if(r.error)return managerView(id,"inquiries");managerView(id,"inquiries")})}
async function managerReports(id){const r=await supabase.from("orders").select("id,status,total,currency,created_at").eq("business_id",id).order("created_at",{ascending:false}).limit(500);if(r.error)return '<div class="notice">'+esc(r.error.message)+'</div>';const rows=r.data||[],done=rows.filter(x=>x.status==="delivered"),amount=done.reduce((n,x)=>n+Number(x.total||0),0);return '<div class="manager-pagehead"><div><span class="eyebrow">ANALYTICS</span><h2>Restaurant reports</h2><p>Sales and order summaries from saved order records.</p></div><button class="primary" id="downloadReport">Download CSV</button></div><div class="grid metrics manager-metrics">'+metric("Orders",rows.length,"Up to 500 latest")+metric("Delivered",done.length,"Completed orders")+metric("Recorded sales","₹"+amount.toFixed(2),"Delivered orders only")+metric("Average bill","₹"+(done.length?amount/done.length:0).toFixed(2),"Across delivered orders")+'</div><div class="panel"><h2>Latest orders</h2><div class="business-list">'+(rows.slice(0,30).map(x=>'<div class="business-row"><div class="avatar">₹</div><div class="row-main"><strong>'+esc(x.status)+'</strong><span>'+esc(new Date(x.created_at).toLocaleString())+'</span></div><span class="pill active">₹'+esc(Number(x.total||0).toFixed(2))+'</span></div>').join("")||empty("No report data","Orders will appear once this restaurant has activity."))+'</div></div>'}
function bindManagerReports(id){const button=document.querySelector("#downloadReport");if(!button)return;button.onclick=async()=>{const r=await supabase.from("orders").select("id,status,total,currency,created_at").eq("business_id",id).order("created_at",{ascending:false}).limit(500);if(r.error)return alert(r.error.message);const cell=v=>'"'+String(v??"").replaceAll('"','""')+'"';const csv=["order_id,status,total,currency,created_at",...(r.data||[]).map(x=>[x.id,x.status,x.total,x.currency,x.created_at].map(cell).join(","))].join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="digital-vision-orders.csv";link.click();URL.revokeObjectURL(url)}}
function managerModuleSetup(title,key){const text={digital_page:"Add your restaurant description, logo and cover image. Preview the customer menu before you publish it.",qr:"Create a QR code for every table. Guests open the menu with the correct table already selected.",offers:"Create offers that are calculated automatically at checkout; customers cannot change the discount.",automation:"Manage order alerts and customer status updates."}[key]||"This module is enabled for your business.";return '<div class="manager-pagehead"><div><span class="eyebrow">MANAGER WORKSPACE</span><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p></div></div><div class="panel"><div class="empty"><strong>'+esc(title)+' needs its restaurant data setup</strong><span>The screen is ready to connect. It will be activated when the tables and secure customer-order service are added.</span></div></div>'}

async function workspaceForBusiness(id){
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
  if(role==="manager")return managerView(id,"overview");
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

  const staffPanel=role==="manager" ? '<div class="panel staff-access-panel"><div class="panel-head"><div><h2>Team access</h2><p>Create only the two staff roles for this business.</p></div></div><form id="staffForm" class="form-grid"><label>Staff email<input id="staffEmail" type="email" required placeholder="staff@example.com"></label><label>Display name<input id="staffName" maxlength="120" placeholder="Staff name"></label><label class="full">Access type<select id="staffRole"><option value="order_taker">Order Taker</option><option value="bill_counter">Bill Counter</option></select></label><div class="full"><button class="primary">Invite team member</button></div></form><div id="staffFeedback" class="compact-note" aria-live="polite"></div><div class="business-list" id="staffMembers"></div></div>' : "";
  shell(role==="manager"?"Manager dashboard":"Workspace",'<div class="back" id="workspaceBack">← '+(isAdmin()?"Business":"Businesses")+'</div><div class="hero-row"><div><span class="eyebrow">'+esc(typeLabel(b.business_type))+'</span><h2>'+esc(role==="manager"?"Welcome, "+managerName:b.name)+'</h2><p class="muted">'+esc(role==="manager"?b.name+" · "+role+" workspace · "+b.slug:role+" workspace · "+b.slug)+'</p></div><span class="pill active">'+esc(b.status)+'</span></div><div class="grid cards">'+(cards||empty("No modules enabled","A platform administrator needs to enable modules for this business."))+'</div>'+staffPanel);
  document.querySelector("#workspaceBack").onclick=()=>isAdmin()?businessDetail(id):render("businesses");
  document.querySelectorAll("[data-open-catalog]").forEach(x=>x.onclick=()=>catalogView(x.dataset.openCatalog));
  if(role==="manager") loadStaffMembers(id);
}


async function loadStaffMembers(businessId){
  const list=document.querySelector("#staffMembers");
  if(!list)return;
  const result=await supabase.from("business_members").select("user_id,role,display_name,status,created_at").eq("business_id",businessId).in("role",["order_taker","bill_counter"]).order("created_at",{ascending:true});
  if(result.error){list.innerHTML=empty("Could not load team members",esc(result.error.message));return;}
  list.innerHTML=(result.data||[]).length?(result.data||[]).map(m=>'<div class="business-row staff-member-row"><div class="avatar">'+esc((m.display_name||m.role).slice(0,1).toUpperCase())+'</div><div class="row-main"><strong>'+esc(m.display_name||m.role.replace("_"," "))+'</strong><span>'+esc(m.role.replace("_"," "))+' · '+esc(m.user_id)+'</span></div><span class="pill '+(m.status==="active"?"active":"suspended")+'">'+esc(m.status)+'</span></div>').join(""):empty("No team members yet","Invite your first Order Taker or Bill Counter.");
  const form=document.querySelector("#staffForm");
  if(!form||form.dataset.bound==="true")return;
  form.dataset.bound="true";
  form.onsubmit=async e=>{
    e.preventDefault();
    const button=form.querySelector("button");const feedback=document.querySelector("#staffFeedback");
    button.disabled=true;button.textContent="Sending invite…";feedback.textContent="";
    const response=await supabase.functions.invoke("admin-manage-member",{body:{business_id:businessId,email:document.querySelector("#staffEmail").value.trim().toLowerCase(),display_name:document.querySelector("#staffName").value.trim()||null,role:document.querySelector("#staffRole").value}});
    button.disabled=false;button.textContent="Invite team member";
    if(response.error||response.data?.error){feedback.textContent=response.data?.error||response.error?.message||"Could not invite this team member.";return;}
    form.reset();feedback.textContent="Invitation sent. The team member has been added to this business.";await loadStaffMembers(businessId);
  };
}
async function catalogView(id,editItemId=null,editCategoryId=null){
  const [bq,cq,iq]=await Promise.all([
    supabase.from("businesses").select("id,name,business_type,slug").eq("id",id).single(),
    supabase.from("catalog_categories").select("*").eq("business_id",id).order("sort_order").order("name"),
    supabase.from("catalog_items").select("*").eq("business_id",id).order("created_at",{ascending:false})
  ]);
  if(bq.error)return error(bq.error.message);
  if(cq.error)return error(cq.error.message);
  if(iq.error)return error(iq.error.message);

  const b=bq.data,categories=cq.data||[],items=iq.data||[];
  const editCategory=categories.find(x=>x.id===editCategoryId)||null;
  const editItem=items.find(x=>x.id===editItemId)||null;
  const activeCategories=categories.filter(x=>x.active);
  const catName=idv=>(categories.find(x=>x.id===idv)?.name)||"Uncategorized";

  shell("Catalog",'<div class="back" id="catalogBack">← Workspace</div><div class="hero-row"><div><span class="eyebrow">Catalog</span><h2>'+esc(b.name)+'</h2><p class="muted">Products and services for this business.</p></div><span class="pill active">'+esc(typeLabel(b.business_type))+'</span></div><div class="catalog-grid"><div class="panel"><div class="panel-head"><div><h2>'+((editCategory)?"Edit category":"Add category")+'</h2><p>Use categories to organize the catalog.</p></div></div><form id="categoryForm" class="form-grid"><label>Category name<input id="categoryName" required value="'+esc(editCategory?.name||"")+'" placeholder="Example: Main Course"></label><label>Sort order<input id="categorySort" type="number" value="'+esc(editCategory?.sort_order??0)+'" min="0"></label><div class="full"><button class="primary">'+((editCategory)?"Save category":"Add category")+'</button>'+((editCategory)?'<button type="button" class="secondary" id="cancelCategory">Cancel</button>':"")+'</div></form><div class="business-list compact-list">'+(categories.length?categories.map(c=>'<div class="business-row category-row"><div class="avatar">C</div><div class="row-main"><strong>'+esc(c.name)+'</strong><span>Order '+esc(c.sort_order)+'</span></div><span class="pill '+(c.active?"active":"archived")+'">'+(c.active?"Active":"Archived")+'</span><button class="mini-btn" data-edit-category="'+esc(c.id)+'">Edit</button></div>').join(""):empty("No categories","Create your first category."))+'</div></div><div class="panel"><div class="panel-head"><div><h2>'+((editItem)?"Edit catalog item":"Add catalog item")+'</h2><p>Products and services share the same catalog.</p></div></div><form id="itemForm" class="form-grid"><label>Name<input id="itemName" required value="'+esc(editItem?.name||"")+'" placeholder="Example: Gold Ring"></label><label>Type<select id="itemType"><option value="product" '+(editItem?.item_type==="product"||!editItem?"selected":"")+'>Product</option><option value="service" '+(editItem?.item_type==="service"?"selected":"")+'>Service</option></select></label><label>Category<select id="itemCategory"><option value="">Uncategorized</option>'+activeCategories.map(c=>'<option value="'+esc(c.id)+'" '+(editItem?.category_id===c.id?"selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select></label><label>Price<input id="itemPrice" type="number" min="0" step="0.01" value="'+esc(editItem?.price??"")+'" placeholder="0"></label><label class="full">Image URL<input id="itemImage" type="url" value="'+esc(editItem?.image_url||"")+'" placeholder="https://..."></label><label class="full">Upload product photo<input id="itemImageFile" type="file" accept="image/jpeg,image/png,image/webp"><small class="compact-note">JPG, PNG or WebP · up to 8 MB. Storage is enabled after the restaurant migration is installed.</small></label><label class="full">Description<textarea id="itemDescription" rows="3" placeholder="Short description"></textarea></label><label class="check-line"><input id="itemActive" type="checkbox" '+(editItem?.active!==false?"checked":"")+'><span>Active</span></label><div class="full"><button class="primary">'+((editItem)?"Save item":"Add item")+'</button>'+((editItem)?'<button type="button" class="secondary" id="cancelItem">Cancel</button>':"")+'</div></form></div></div><div class="panel"><div class="panel-head"><div><h2>Catalog items</h2><p>'+esc(String(items.length))+' item(s)</p></div></div><div class="item-list">'+(items.length?items.map(it=>'<article class="item-card"><div><strong>'+esc(it.name)+'</strong><span>'+esc(it.item_type)+' · '+esc(catName(it.category_id))+'</span><p>'+esc(it.description||"")+'</p></div><div class="item-meta"><strong>₹'+esc(it.price??"0")+'</strong><span class="pill '+(it.active?"active":"archived")+'">'+(it.active?"Active":"Archived")+'</span><div class="mini-actions"><button class="mini-btn" data-edit-item="'+esc(it.id)+'">Edit</button><button class="mini-btn" data-toggle-item="'+esc(it.id)+'">'+(it.active?"Archive":"Activate")+'</button></div></div></article>').join(""):empty("No catalog items","Add your first product or service above."))+'</div></div>');

  const setText=(idv,value)=>{const el=document.querySelector(idv);if(el)el.value=value||""};
  setText("#itemDescription",editItem?.description||"");
  document.querySelector("#catalogBack").onclick=()=>workspaceForBusiness(id);

  document.querySelector("#categoryForm").onsubmit=async e=>{
    e.preventDefault();
    const payload={business_id:id,name:document.querySelector("#categoryName").value.trim(),sort_order:Number(document.querySelector("#categorySort").value)||0,active:true};
    const r=editCategory
      ? await supabase.from("catalog_categories").update(payload).eq("id",editCategory.id)
      : await supabase.from("catalog_categories").insert(payload);
    if(r.error)return alert(r.error.message);
    await catalogView(id);
  };
  if(document.querySelector("#cancelCategory"))document.querySelector("#cancelCategory").onclick=()=>catalogView(id);

  document.querySelector("#itemForm").onsubmit=async e=>{
    e.preventDefault();
    const photo=document.querySelector("#itemImageFile").files?.[0];let imageUrl=document.querySelector("#itemImage").value.trim()||null;if(photo){if(!["image/jpeg","image/png","image/webp"].includes(photo.type)||photo.size>8*1024*1024)return alert("Choose a JPG, PNG or WebP image under 8 MB.");const objectPath=id+"/products/"+crypto.randomUUID()+"-"+photo.name.replace(/[^a-zA-Z0-9._-]/g,"-");const upload=await supabase.storage.from("digital-menu-media").upload(objectPath,photo,{contentType:photo.type,upsert:false});if(upload.error)return alert("Photo upload is not ready yet: "+upload.error.message);imageUrl=supabase.storage.from("digital-menu-media").getPublicUrl(objectPath).data.publicUrl;}\n    const payload={business_id:id,name:document.querySelector("#itemName").value.trim(),description:document.querySelector("#itemDescription").value.trim()||null,item_type:document.querySelector("#itemType").value,category_id:document.querySelector("#itemCategory").value||null,price:document.querySelector("#itemPrice").value===""?null:Number(document.querySelector("#itemPrice").value),currency:"INR",image_url:imageUrl,active:document.querySelector("#itemActive").checked};
    const r=editItem
      ? await supabase.from("catalog_items").update(payload).eq("id",editItem.id)
      : await supabase.from("catalog_items").insert(payload);
    if(r.error)return alert(r.error.message);
    await catalogView(id);
  };
  if(document.querySelector("#cancelItem"))document.querySelector("#cancelItem").onclick=()=>catalogView(id);

  document.querySelectorAll("[data-edit-item]").forEach(btn=>btn.onclick=()=>catalogView(id,btn.dataset.editItem,null));
  document.querySelectorAll("[data-edit-category]").forEach(btn=>btn.onclick=()=>catalogView(id,null,btn.dataset.editCategory));
  document.querySelectorAll("[data-toggle-item]").forEach(btn=>btn.onclick=async()=>{
    const it=items.find(x=>x.id===btn.dataset.toggleItem);if(!it)return;
    const r=await supabase.from("catalog_items").update({active:!it.active}).eq("id",it.id);
    if(r.error)return alert(r.error.message);
    await catalogView(id);
  });
}

function error(m){app.innerHTML='<main class="auth-page"><div class="auth-card"><h1>Something went wrong</h1><p class="muted">'+esc(m)+'</p><button class="primary" onclick="location.reload()">Retry</button></div></main>'}
async function load(){
  const u=await supabase.auth.getUser();state.user=u.data.user;if(!state.user)return login();
  if(state.user.app_metadata?.must_change_password){renderFirstLoginPassword({app,supabase,boot,esc});return}
  const [b,m,mc]=await Promise.all([supabase.from("businesses").select("*").order("created_at",{ascending:false}),supabase.from("modules").select("*").order("name"),supabase.from("business_members").select("id",{count:"exact",head:true})]);
  if(b.error)return error(b.error.message);if(m.error)return error(m.error.message);state.businesses=b.data||[];state.modules=m.data||[];state.memberCount=mc.error?null:mc.count;
}
async function boot(){await load();if(!state.user||state.user.app_metadata?.must_change_password)return;render(isAdmin()?"home":"workspace")}
function render(v){if(!state.user)return login();if(!isAdmin() && ["home","businesses","modules"].includes(v))return workspace();if(v==="home"){shell("Overview",overview());document.querySelector("#newBusiness").onclick=createBusiness;const search=document.querySelector("#homeSearch"),status=document.querySelector("#homeStatus"),list=document.querySelector("#homeBusinessList");const paint=()=>{const q=search.value.trim().toLowerCase(),rows=state.businesses.filter(b=>(b.name+" "+b.slug+" "+b.business_type).toLowerCase().includes(q)&&(status.value==="all"||b.status===status.value));list.innerHTML=rows.length?rows.map(row).join(""):empty("No matching businesses","Try another search or filter.");document.querySelectorAll("[data-business]").forEach(x=>x.onclick=()=>businessDetail(x.dataset.business))};search.oninput=paint;status.onchange=paint;paint();return}if(v==="businesses")return businesses();if(v==="modules")return modules();return workspace()}
supabase.auth.onAuthStateChange((event,s)=>{
  // OTP verification creates a temporary session. Keep the recovery UI in control
  // until the password is changed and signOut completes; never boot the dashboard mid-recovery.
  if(app.dataset.authFlow === "recovery" && event !== "SIGNED_OUT") return;
  if(s?.user)boot();else login();
});
boot();

