import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://qwyquvufneolyesfiipf.supabase.co";
const SUPABASE_KEY = "sb_publishable_P-N6bQR54Ui4idQahqQwdg_U9l6xz39";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.querySelector("#app");
const state = { user:null, businesses:[], modules:[] };

const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const typeLabel = t => ({restaurant:"Restaurant",retail:"Retail",jewellery:"Jewellery",clothing:"Clothing",salon:"Salon",services:"Services",other:"Other"}[t]||t);
const isAdmin = () => state.user?.app_metadata?.role === "admin";

function login(message=""){
  app.innerHTML='<main class="auth-page"><div class="auth-card"><div class="brand center"><span>AOG</span><strong>ATELIER OG</strong><small>BUSINESS OS</small></div><h1>Sign in</h1><p class="muted">Manage businesses, modules and digital experiences.</p>'+(message?'<div class="notice">'+esc(message)+'</div>':'')+'<form id="login"><label>Email<input id="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><label>Password<input id="password" type="password" required autocomplete="current-password" placeholder="••••••••"></label><button class="primary">Sign in</button></form><button id="forgot" class="link-btn">Forgot password?</button></div></main>';
  document.querySelector("#login").onsubmit=async e=>{e.preventDefault();const email=document.querySelector("#email").value.trim(),password=document.querySelector("#password").value;const r=await supabase.auth.signInWithPassword({email,password});if(r.error)return login(r.error.message);await boot()};
  document.querySelector("#forgot").onclick=async()=>{const email=document.querySelector("#email").value.trim();if(!email)return login("Enter your email first.");const r=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});login(r.error?r.error.message:"Password reset email sent. Check your inbox.")};
}

function shell(title,content){
  app.innerHTML='<div class="app-shell"><aside class="sidebar"><div class="brand"><span>AOG</span><strong>ATELIER OG</strong><small>BUSINESS OS</small></div><nav><button data-view="home">Overview</button><button data-view="businesses">Businesses</button><button data-view="modules">Modules</button></nav><button id="signout" class="ghost">Sign out</button></aside><main class="main"><header class="topbar"><div><small>BUSINESS OS</small><h1>'+esc(title)+'</h1></div><span class="status-dot">● Connected</span></header><section class="content">'+content+'</section></main></div>';
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>render(b.dataset.view));
  document.querySelector("#signout").onclick=async()=>{await supabase.auth.signOut();login()};
}
const metric=(a,b,c)=>'<div class="metric"><small>'+esc(a)+'</small><strong>'+esc(b)+'</strong><span>'+esc(c)+'</span></div>';
const empty=(a,b)=>'<div class="empty"><strong>'+esc(a)+'</strong><span>'+esc(b)+'</span></div>';
const row=b=>'<button class="business-row" data-business="'+b.id+'"><div class="avatar">'+esc(b.name.slice(0,1).toUpperCase())+'</div><div class="row-main"><strong>'+esc(b.name)+'</strong><span>'+esc(typeLabel(b.business_type))+' · '+esc(b.slug)+'</span></div><span class="pill '+b.status+'">'+esc(b.status)+'</span><span class="arrow">→</span></button>';

function overview(){
  return '<div class="grid metrics">'+metric("Businesses",state.businesses.length,"tenant accounts")+metric("Modules",state.modules.length,"platform modules")+metric("Active",state.businesses.filter(b=>b.status==="active").length,"currently enabled")+metric("Account",state.user.email||"Signed in","super admin")+'</div><div class="panel"><div class="panel-head"><div><h2>Platform overview</h2><p>One workspace for different business types.</p></div><button class="primary" id="newBusiness">+ Create business</button></div><div class="business-list">'+(state.businesses.length?state.businesses.map(row).join(""):empty("No businesses yet","Create the first tenant."))+'</div></div>';
}
async function businesses(){
  shell("Businesses",'<div class="panel"><div class="panel-head"><div><h2>Businesses</h2><p>Create and manage tenant workspaces.</p></div><button class="primary" id="newBusiness">+ Create business</button></div><div id="list" class="business-list"></div></div>');
  document.querySelector("#list").innerHTML=state.businesses.length?state.businesses.map(row).join(""):empty("No businesses yet","Create the first tenant.");
  document.querySelectorAll("[data-business]").forEach(x=>x.onclick=()=>businessDetail(x.dataset.business));
  document.querySelector("#newBusiness").onclick=createBusiness;
}
function createBusiness(){
  shell("Create business",'<div class="panel narrow"><div class="panel-head"><div><h2>New business</h2><p>A business is an isolated tenant.</p></div></div><form id="businessForm" class="form-grid"><label>Business name<input id="bname" required placeholder="Example Studio"></label><label>Business type<select id="btype">'+["restaurant","retail","jewellery","clothing","salon","services","other"].map(x=>'<option value="'+x+'">'+typeLabel(x)+'</option>').join("")+'</select></label><label>Slug<input id="bslug" required pattern="[a-z0-9-]+" placeholder="example-studio"></label><div class="full"><button class="primary">Create business</button><button type="button" class="secondary" id="cancel">Cancel</button></div></form></div>');
  document.querySelector("#cancel").onclick=()=>render("businesses");
  document.querySelector("#businessForm").onsubmit=async e=>{e.preventDefault();const name=document.querySelector("#bname").value.trim(),business_type=document.querySelector("#btype").value,slug=document.querySelector("#bslug").value.trim().toLowerCase();const r=await supabase.from("businesses").insert({name,business_type,slug}).select().single();if(r.error)return alert(r.error.message);state.businesses.unshift(r.data);await businessDetail(r.data.id)};
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
  shell("Business",'<div class="back" id="back">← Businesses</div><div class="hero-row"><div><span class="eyebrow">'+esc(typeLabel(b.business_type))+'</span><h2>'+esc(b.name)+'</h2><p class="muted">'+esc(b.slug)+' · '+esc(b.status)+'</p></div><div class="hero-actions"><span class="pill '+b.status+'">'+esc(b.status)+'</span><button class="secondary" id="openWorkspace">Open workspace</button></div></div><div class="panel"><div class="panel-head"><div><h2>Module access</h2><p>Enable only what this business needs.</p></div><button class="primary" id="save">Save access</button></div><div class="module-grid">'+state.modules.map(m=>'<label class="module-card"><input type="checkbox" value="'+m.id+'" '+(enabled.has(m.id)?"checked":"")+'><span><strong>'+esc(m.name)+'</strong><small>'+esc(m.description||"")+'</small></span></label>').join("")+'</div></div><div class="panel"><div class="panel-head"><div><h2>Members</h2><p>Invite owners, managers and staff to this business.</p></div></div><form id="memberForm" class="form-grid"><label>Email<input id="memail" type="email" required placeholder="staff@example.com"></label><label>Display name<input id="mname" placeholder="Staff name"></label><label>Role<select id="mrole"><option value="owner">Owner</option><option value="manager">Manager</option><option value="staff" selected>Staff</option></select></label><div class="full"><button class="primary">Add / invite member</button></div></form><div class="business-list" id="membersList"></div></div>');
  const renderMembers=rows=>{document.querySelector("#membersList").innerHTML=rows.length?rows.map(m=>'<div class="business-row"><div class="avatar">'+esc((m.display_name||"U").slice(0,1).toUpperCase())+'</div><div class="row-main"><strong>'+esc(m.display_name||"Unnamed member")+'</strong><span>'+esc(m.role)+' · '+esc(m.user_id)+'</span></div><span class="pill '+(m.status==="active"?"active":"suspended")+'">'+esc(m.status)+'</span></div>').join(""):empty("No members yet","Add the first member above.")};
  renderMembers(members.data||[]);
  document.querySelector("#back").onclick=()=>render("businesses");
  document.querySelector("#openWorkspace").onclick=()=>workspaceForBusiness(id);
  document.querySelector("#save").onclick=async()=>{
    const ids=[...document.querySelectorAll(".module-card input:checked")].map(x=>x.value);
    const del=await supabase.from("business_modules").delete().eq("business_id",id);
    if(del.error)return alert(del.error.message);
    if(ids.length){const ins=await supabase.from("business_modules").insert(ids.map(module_id=>({business_id:id,module_id,enabled:true})));if(ins.error)return alert(ins.error.message)}
    alert("Module access saved.");
  };
  document.querySelector("#memberForm").onsubmit=async e=>{
    e.preventDefault();
    const btn=e.submitter;btn.disabled=true;btn.textContent="Saving...";
    const r=await supabase.functions.invoke("admin-manage-member",{body:{business_id:id,email:document.querySelector("#memail").value.trim(),display_name:document.querySelector("#mname").value.trim(),role:document.querySelector("#mrole").value}});
    btn.disabled=false;btn.textContent="Add / invite member";
    if(r.error)return alert(r.error.message);
    if(r.data?.error)return alert(r.data.error);
    alert(r.data?.invited?"Member invited and added.":"Member added.");
    document.querySelector("#memberForm").reset();
    const fresh=await supabase.from("business_members").select("id,user_id,role,display_name,status,created_at").eq("business_id",id).order("created_at",{ascending:true});
    if(fresh.error)return alert(fresh.error.message);renderMembers(fresh.data||[]);
  };
}
function modules(){
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
  const role=isAdmin()?"platform admin":(mq.data?.role||"member");
  const active=new Set((mmq.data||[]).map(x=>x.module_id));
  const mods=state.modules.filter(x=>active.has(x.id));

  const cards=mods.map(m=>{
    const button=m.code==="catalog"
      ? '<button class="secondary" data-open-catalog="'+esc(id)+'">Open module</button>'
      : '<button class="secondary" disabled>Open module</button>';
    return '<div class="feature-card"><span class="feature-icon">◇</span><strong>'+esc(m.name)+'</strong><p>'+esc(m.description||"")+'</p>'+button+'</div>';
  }).join("");

  shell("Workspace",'<div class="back" id="workspaceBack">← '+(isAdmin()?"Business":"Businesses")+'</div><div class="hero-row"><div><span class="eyebrow">'+esc(typeLabel(b.business_type))+'</span><h2>'+esc(b.name)+'</h2><p class="muted">'+esc(role)+' workspace · '+esc(b.slug)+'</p></div><span class="pill active">'+esc(b.status)+'</span></div><div class="grid cards">'+(cards||empty("No modules enabled","A platform administrator needs to enable modules for this business."))+'</div>');
  document.querySelector("#workspaceBack").onclick=()=>isAdmin()?businessDetail(id):render("businesses");
  document.querySelectorAll("[data-open-catalog]").forEach(x=>x.onclick=()=>catalogView(x.dataset.openCatalog));
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

  shell("Catalog",'<div class="back" id="catalogBack">← Workspace</div><div class="hero-row"><div><span class="eyebrow">Catalog</span><h2>'+esc(b.name)+'</h2><p class="muted">Products and services for this business.</p></div><span class="pill active">'+esc(typeLabel(b.business_type))+'</span></div><div class="catalog-grid"><div class="panel"><div class="panel-head"><div><h2>'+((editCategory)?"Edit category":"Add category")+'</h2><p>Use categories to organize the catalog.</p></div></div><form id="categoryForm" class="form-grid"><label>Category name<input id="categoryName" required value="'+esc(editCategory?.name||"")+'" placeholder="Example: Main Course"></label><label>Sort order<input id="categorySort" type="number" value="'+esc(editCategory?.sort_order??0)+'" min="0"></label><div class="full"><button class="primary">'+((editCategory)?"Save category":"Add category")+'</button>'+((editCategory)?'<button type="button" class="secondary" id="cancelCategory">Cancel</button>':"")+'</div></form><div class="business-list compact-list">'+(categories.length?categories.map(c=>'<div class="business-row category-row"><div class="avatar">C</div><div class="row-main"><strong>'+esc(c.name)+'</strong><span>Order '+esc(c.sort_order)+'</span></div><span class="pill '+(c.active?"active":"archived")+'">'+(c.active?"Active":"Archived")+'</span><button class="mini-btn" data-edit-category="'+esc(c.id)+'">Edit</button></div>').join(""):empty("No categories","Create your first category."))+'</div></div><div class="panel"><div class="panel-head"><div><h2>'+((editItem)?"Edit catalog item":"Add catalog item")+'</h2><p>Products and services share the same catalog.</p></div></div><form id="itemForm" class="form-grid"><label>Name<input id="itemName" required value="'+esc(editItem?.name||"")+'" placeholder="Example: Gold Ring"></label><label>Type<select id="itemType"><option value="product" '+(editItem?.item_type==="product"||!editItem?"selected":"")+'>Product</option><option value="service" '+(editItem?.item_type==="service"?"selected":"")+'>Service</option></select></label><label>Category<select id="itemCategory"><option value="">Uncategorized</option>'+activeCategories.map(c=>'<option value="'+esc(c.id)+'" '+(editItem?.category_id===c.id?"selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select></label><label>Price<input id="itemPrice" type="number" min="0" step="0.01" value="'+esc(editItem?.price??"")+'" placeholder="0"></label><label class="full">Image URL<input id="itemImage" type="url" value="'+esc(editItem?.image_url||"")+'" placeholder="https://..."></label><label class="full">Description<textarea id="itemDescription" rows="3" placeholder="Short description"></textarea></label><label class="check-line"><input id="itemActive" type="checkbox" '+(editItem?.active!==false?"checked":"")+'><span>Active</span></label><div class="full"><button class="primary">'+((editItem)?"Save item":"Add item")+'</button>'+((editItem)?'<button type="button" class="secondary" id="cancelItem">Cancel</button>':"")+'</div></form></div></div><div class="panel"><div class="panel-head"><div><h2>Catalog items</h2><p>'+esc(String(items.length))+' item(s)</p></div></div><div class="item-list">'+(items.length?items.map(it=>'<article class="item-card"><div><strong>'+esc(it.name)+'</strong><span>'+esc(it.item_type)+' · '+esc(catName(it.category_id))+'</span><p>'+esc(it.description||"")+'</p></div><div class="item-meta"><strong>₹'+esc(it.price??"0")+'</strong><span class="pill '+(it.active?"active":"archived")+'">'+(it.active?"Active":"Archived")+'</span><div class="mini-actions"><button class="mini-btn" data-edit-item="'+esc(it.id)+'">Edit</button><button class="mini-btn" data-toggle-item="'+esc(it.id)+'">'+(it.active?"Archive":"Activate")+'</button></div></div></article>').join(""):empty("No catalog items","Add your first product or service above."))+'</div></div>');

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
    const payload={business_id:id,name:document.querySelector("#itemName").value.trim(),description:document.querySelector("#itemDescription").value.trim()||null,item_type:document.querySelector("#itemType").value,category_id:document.querySelector("#itemCategory").value||null,price:document.querySelector("#itemPrice").value===""?null:Number(document.querySelector("#itemPrice").value),currency:"INR",image_url:document.querySelector("#itemImage").value.trim()||null,active:document.querySelector("#itemActive").checked};
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
  const [b,m]=await Promise.all([supabase.from("businesses").select("*").order("created_at",{ascending:false}),supabase.from("modules").select("*").order("name")]);
  if(b.error)return error(b.error.message);if(m.error)return error(m.error.message);state.businesses=b.data||[];state.modules=m.data||[];
}
async function boot(){await load();if(!state.user)return;render(isAdmin()?"home":"workspace")}
function render(v){if(!state.user)return login();if(v==="home"){shell("Overview",overview());document.querySelector("#newBusiness").onclick=createBusiness;document.querySelectorAll("[data-business]").forEach(x=>x.onclick=()=>businessDetail(x.dataset.business));return}if(v==="businesses")return businesses();if(v==="modules")return modules();return workspace()}
supabase.auth.onAuthStateChange((_e,s)=>{if(s?.user)boot();else login()});
boot();