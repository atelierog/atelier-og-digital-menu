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
  const r=await supabase.from("business_modules").select("module_id,enabled").eq("business_id",id);if(r.error)return alert(r.error.message);
  const enabled=new Set((r.data||[]).filter(x=>x.enabled).map(x=>x.module_id));
  shell("Business",'<div class="back" id="back">← Businesses</div><div class="hero-row"><div><span class="eyebrow">'+esc(typeLabel(b.business_type))+'</span><h2>'+esc(b.name)+'</h2><p class="muted">'+esc(b.slug)+' · '+esc(b.status)+'</p></div><span class="pill '+b.status+'">'+esc(b.status)+'</span></div><div class="panel"><div class="panel-head"><div><h2>Module access</h2><p>Enable only what this business needs.</p></div><button class="primary" id="save">Save access</button></div><div class="module-grid">'+state.modules.map(m=>'<label class="module-card"><input type="checkbox" value="'+m.id+'" '+(enabled.has(m.id)?"checked":"")+'><span><strong>'+esc(m.name)+'</strong><small>'+esc(m.description||"")+'</small></span></label>').join("")+'</div></div>');
  document.querySelector("#back").onclick=()=>render("businesses");
  document.querySelector("#save").onclick=async()=>{const ids=[...document.querySelectorAll(".module-card input:checked")].map(x=>x.value);await supabase.from("business_modules").delete().eq("business_id",id);if(ids.length)await supabase.from("business_modules").insert(ids.map(module_id=>({business_id:id,module_id,enabled:true})));alert("Module access saved.")};
}
function modules(){
  shell("Modules",'<div class="panel"><div class="panel-head"><div><h2>Platform modules</h2><p>Capabilities that can be assigned per business.</p></div></div><div class="module-grid">'+state.modules.map(m=>'<div class="module-card static"><span><strong>'+esc(m.name)+'</strong><small>'+esc(m.description||"")+'</small></span><code>'+esc(m.code)+'</code></div>').join("")+'</div></div>');
}
async function workspace(){
  const r=await supabase.from("business_members").select("business_id,role,display_name,status").eq("user_id",state.user.id);
  if(r.error)return error(r.error.message);
  if(!r.data?.length)return shell("Workspace",empty("No business assigned","Ask a platform administrator to add your account to a business."));
  const ids=r.data.map(x=>x.business_id),bq=await supabase.from("businesses").select("*").in("id",ids),b=bq.data?.[0],links=await supabase.from("business_modules").select("module_id").eq("business_id",b.id).eq("enabled",true),active=new Set((links.data||[]).map(x=>x.module_id)),mods=state.modules.filter(x=>active.has(x.id));
  shell("Workspace",'<div class="hero-row"><div><span class="eyebrow">'+esc(typeLabel(b.business_type))+'</span><h2>'+esc(b.name)+'</h2><p class="muted">'+esc(r.data[0].role)+' workspace</p></div><span class="pill active">Active</span></div><div class="grid cards">'+(mods.length?mods.map(m=>'<div class="feature-card"><span class="feature-icon">◇</span><strong>'+esc(m.name)+'</strong><p>'+esc(m.description||"")+'</p><button class="secondary" disabled>Open module</button></div>').join(""):empty("No modules enabled","A platform administrator needs to enable modules."))+'</div>');
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