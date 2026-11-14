import { isSixDigitPassword, isStaffPassword } from "./password-policy.mjs";
import { isValidStaffLoginId, normalizeStaffLoginId, staffAuthEmail } from "./staff-login.mjs";

const eyeIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const eyeOffIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.8 10.8 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.3 0 2.5-.3 3.5-.8"/></svg>';

function passwordInputMarkup(id,placeholder,autocomplete="new-password",sixDigit=false,staffPassword=false){
  const constraints=sixDigit?' inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" title="Enter exactly six digits"':staffPassword?' minlength="6" maxlength="72" title="Use at least 6 characters"':'';
  return '<div class="password-field"><input id="'+id+'" type="password" required autocomplete="'+autocomplete+'" placeholder="'+placeholder+'"'+constraints+'><button type="button" class="password-toggle" data-password-toggle="'+id+'" aria-label="Show password" aria-pressed="false">'+eyeIcon+'</button></div>';
}

function bindPasswordToggles(){
  document.querySelectorAll("[data-password-toggle]").forEach(button=>{
    const input=document.getElementById(button.dataset.passwordToggle);
    if(!input)return;
    button.onclick=()=>{
      const show=input.type==="password";
      input.type=show?"text":"password";
      button.setAttribute("aria-label",show?"Hide password":"Show password");
      button.setAttribute("aria-pressed",String(show));
      button.innerHTML=show?eyeOffIcon:eyeIcon;
    };
  });
}

export function renderLogin({app,supabase,boot,esc},message="",mode="login",emailValue=""){
  app.dataset.authFlow = (mode === "request" || mode === "verify" || mode === "staff-request" || mode === "staff-verify") ? "recovery" : "login";
  const safeMessage=message?'<div class="notice">'+esc(message)+'</div>':'';
  const brand='<div class="brand center"><strong>DIGITAL VISION</strong><small>BY ATELIER OG</small></div>';
  const emailField='<label>Email address<input id="email" type="email" required autocomplete="email" placeholder="you@example.com" value="'+esc(emailValue)+'"></label>';

  if(mode==="login"||mode==="manager-login"||mode==="staff-login")mode="unified";

  if(mode==="unified"){
    app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<h1>Sign in</h1><p class="muted">Use your email or staff username.</p>'+safeMessage+'<form id="unifiedLogin"><label>Email or staff username<input id="loginIdentifier" required autocomplete="username" placeholder="Email or staff username" value="'+esc(emailValue)+'"></label><label>Password'+passwordInputMarkup("password","Enter your password","current-password",false,true)+'</label><button class="primary">Sign in</button></form><button id="forgotUnified" class="link-btn">Forgot password?</button><button id="installApp" class="link-btn">Install Digital Vision</button><small id="installTip" class="compact-note"></small></div></main>';
    bindPasswordToggles();
    document.querySelector("#unifiedLogin").onsubmit=async e=>{e.preventDefault();const identifier=document.querySelector("#loginIdentifier").value.trim(),password=document.querySelector("#password").value,button=e.submitter;button.disabled=true;button.textContent="Signing in…";const result=identifier.includes("@")?await supabase.auth.signInWithPassword({email:identifier.toLowerCase(),password}):isValidStaffLoginId(identifier)?await supabase.auth.signInWithPassword({email:staffAuthEmail(identifier),password}):{error:{message:"Enter your Manager email or staff username."}};if(result.error){button.disabled=false;button.textContent="Sign in";return renderLogin({app,supabase,boot,esc},identifier.includes("@")?"Email or password is incorrect.":result.error.message,"unified",identifier)}await boot()};
    document.querySelector("#forgotUnified").onclick=()=>{const identifier=document.querySelector("#loginIdentifier").value.trim();if(identifier.includes("@"))return renderLogin({app,supabase,boot,esc},"","request",identifier.toLowerCase());if(!isValidStaffLoginId(identifier))return renderLogin({app,supabase,boot,esc},"Enter your email or staff username first.","unified",identifier);renderLogin({app,supabase,boot,esc},"","staff-request",normalizeStaffLoginId(identifier))};
    document.querySelector("#installApp").onclick=async()=>{const prompt=window.deferredInstallPrompt,tip=document.querySelector("#installTip");if(!prompt){tip.textContent="In Chrome, open the menu and choose Install Digital Vision.";return}await prompt.prompt();const choice=await prompt.userChoice;window.deferredInstallPrompt=null;tip.textContent=choice.outcome==="accepted"?"Digital Vision was added to your apps.":"You can install it later from the browser menu."};
    return;
  }

  if(mode==="staff-request"){
    app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<h1>Reset staff password</h1><p class="muted">Enter the staff username. A one-time code will be sent to the Manager.</p>'+safeMessage+'<form id="staffResetRequest"><label>Staff username<input id="staffLoginId" required autocomplete="username" placeholder="Your staff username" value="'+esc(emailValue)+'"></label><button class="primary">Request reset code</button></form><button id="backStaffLogin" class="link-btn">Back to sign in</button></div></main>';
    document.querySelector("#backStaffLogin").onclick=()=>renderLogin({app,supabase,boot,esc},"","unified",emailValue);
    document.querySelector("#staffResetRequest").onsubmit=async e=>{
      e.preventDefault();const staffLoginId=normalizeStaffLoginId(document.querySelector("#staffLoginId").value),btn=e.submitter;btn.disabled=true;btn.textContent="Sending...";
      const r=await supabase.functions.invoke("staff-password-reset",{body:{action:"request",staff_login_id:staffLoginId}});
      if(r.error||r.data?.error){btn.disabled=false;btn.textContent="Request reset code";return renderLogin({app,supabase,boot,esc},r.data?.error||r.error?.message||"Could not request a reset code.","staff-request",staffLoginId)}
      renderLogin({app,supabase,boot,esc},"If the username exists, a one-time code has been sent to the Manager.","staff-verify",staffLoginId);
    };
    return;
  }

  if(mode==="staff-verify"){
    app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<h1>Verify reset code</h1><p class="muted">Ask the Manager for the code sent to their email, then choose a new password.</p>'+safeMessage+'<form id="staffResetVerify"><label>Staff username<input id="staffLoginId" required value="'+esc(emailValue)+'" readonly></label><label>One-time code<input id="staffResetCode" inputmode="numeric" autocomplete="one-time-code" required minlength="6" maxlength="6" placeholder="6-digit code"></label><label>New password'+passwordInputMarkup("staffNewPassword","Enter your password","new-password",false,true)+'</label><label>Confirm password'+passwordInputMarkup("staffConfirmPassword","Re-enter your password","new-password",false,true)+'</label><p class="compact-note">Use at least 6 characters. Letters, numbers and symbols are allowed.</p><button class="primary">Verify and save password</button></form><button id="backStaffLogin" class="link-btn">Back to staff sign in</button></div></main>';
    bindPasswordToggles();
    document.querySelector("#backStaffLogin").onclick=()=>renderLogin({app,supabase,boot,esc},"","unified",emailValue);
    document.querySelector("#staffResetVerify").onsubmit=async e=>{
      e.preventDefault();const password=document.querySelector("#staffNewPassword").value,confirm=document.querySelector("#staffConfirmPassword").value;
      if(password!==confirm)return renderLogin({app,supabase,boot,esc},"The passwords do not match.","staff-verify",emailValue);
      if(!isStaffPassword(password))return renderLogin({app,supabase,boot,esc},"Use a password with at least 6 characters.","staff-verify",emailValue);
      const btn=e.submitter;btn.disabled=true;btn.textContent="Verifying...";
      const r=await supabase.functions.invoke("staff-password-reset",{body:{action:"complete",staff_login_id:normalizeStaffLoginId(emailValue),code:document.querySelector("#staffResetCode").value.trim(),password}});
      if(r.error||r.data?.error){btn.disabled=false;btn.textContent="Verify and save password";return renderLogin({app,supabase,boot,esc},r.data?.error||r.error?.message||"The code could not be verified.","staff-verify",emailValue)}
      renderLogin({app,supabase,boot,esc},"Password updated. Sign in with your username and new password.","unified",emailValue);
    };
    return;
  }

  if(mode==="request"){
    app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<h1>Reset your password</h1><p class="muted">We’ll send a one-time recovery code to your registered email.</p>'+safeMessage+'<form id="recoveryRequest">'+emailField+'<button class="primary">Send recovery code</button></form><button id="backLogin" class="link-btn">Back to sign in</button></div></main>';
    document.querySelector("#backLogin").onclick=()=>renderLogin({app,supabase,boot,esc},"","manager-login",emailValue);
    document.querySelector("#recoveryRequest").onsubmit=async e=>{
      e.preventDefault();
      const email=document.querySelector("#email").value.trim().toLowerCase();
      const btn=e.submitter;btn.disabled=true;btn.textContent="Sending...";
      const r=await supabase.auth.resetPasswordForEmail(email);
      if(r.error){btn.disabled=false;btn.textContent="Send recovery code";return renderLogin({app,supabase,boot,esc},r.error.message,"request",email)}
      renderLogin({app,supabase,boot,esc},"If the account exists, a recovery code has been sent. Check your inbox.","verify",email);
    };
    return;
  }

  if(mode==="verify"){
    app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<h1>Verify and change password</h1><p class="muted">Enter the recovery code sent to your email, then choose a new password.</p>'+safeMessage+'<form id="recoveryVerify">'+emailField+'<label>One-time code<input id="recoveryToken" inputmode="numeric" autocomplete="one-time-code" required minlength="6" maxlength="10" placeholder="Enter email code"></label><label>New password'+passwordInputMarkup("newPassword","Enter 6-digit password","new-password",true)+'</label><label>Confirm password'+passwordInputMarkup("confirmPassword","Re-enter 6-digit password","new-password",true)+'</label><button class="primary">Verify code and save password</button></form><button id="resendCode" class="link-btn">Send a new code</button><button id="backLogin" class="link-btn">Back to sign in</button></div></main>';
    bindPasswordToggles();
    document.querySelector("#backLogin").onclick=()=>renderLogin({app,supabase,boot,esc});
    document.querySelector("#resendCode").onclick=()=>renderLogin({app,supabase,boot,esc},"Request a new recovery code below.","request",emailValue);
    document.querySelector("#recoveryVerify").onsubmit=async e=>{
      e.preventDefault();
      const email=document.querySelector("#email").value.trim().toLowerCase();
      const token=document.querySelector("#recoveryToken").value.trim();
      const password=document.querySelector("#newPassword").value;
      const confirm=document.querySelector("#confirmPassword").value;
      if(password!==confirm)return renderLogin({app,supabase,boot,esc},"The passwords do not match.","verify",email);
      if(!isSixDigitPassword(password))return renderLogin({app,supabase,boot,esc},"Use exactly six digits for your password.","verify",email);
      const btn=e.submitter;btn.disabled=true;btn.textContent="Verifying...";
      const verified=await supabase.auth.verifyOtp({email,token,type:"recovery"});
      if(verified.error){btn.disabled=false;btn.textContent="Verify code and save password";return renderLogin({app,supabase,boot,esc},verified.error.message,"verify",email)}
      const updated=await supabase.auth.updateUser({password});
      if(updated.error){btn.disabled=false;btn.textContent="Verify code and save password";return renderLogin({app,supabase,boot,esc},updated.error.message,"verify",email)}
      await supabase.auth.signOut();
      renderLogin({app,supabase,boot,esc},"Password updated. Sign in with your new password.");
    };
    return;
  }

  if(mode==="staff-login"){
    app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<div class="auth-mode-switch"><button id="managerMode" type="button">Manager</button><button class="active" type="button" aria-current="page">Staff</button></div><h1>Staff sign in</h1>'+safeMessage+'<form id="staffLogin"><label>Staff ID<input id="staffLoginId" required autocomplete="username" placeholder="OT-12345678" value="'+esc(emailValue)+'"></label><label>Password'+passwordInputMarkup("password","Enter your password","current-password",false,true)+'</label><button class="primary">Sign in</button></form><button id="forgotStaff" class="link-btn">Forgot password?</button></div></main>';
    bindPasswordToggles();
    document.querySelector("#managerMode").onclick=()=>renderLogin({app,supabase,boot,esc},"","manager-login");
    document.querySelector("#forgotStaff").onclick=()=>renderLogin({app,supabase,boot,esc},"","staff-request",normalizeStaffLoginId(document.querySelector("#staffLoginId").value));
    document.querySelector("#staffLogin").onsubmit=async e=>{e.preventDefault();const staffId=normalizeStaffLoginId(document.querySelector("#staffLoginId").value),password=document.querySelector("#password").value,internalEmail=staffAuthEmail(staffId);if(!isValidStaffLoginId(staffId)||!internalEmail)return renderLogin({app,supabase,boot,esc},"Check the staff ID and try again.","staff-login",staffId);const r=await supabase.auth.signInWithPassword({email:internalEmail,password});if(r.error)return renderLogin({app,supabase,boot,esc},"Staff ID or password is incorrect.","staff-login",staffId);await boot()};
    return;
  }

  app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<div class="auth-mode-switch"><button class="active" type="button" aria-current="page">Manager</button><button id="staffMode" type="button">Staff</button></div><h1>Manager sign in</h1>'+safeMessage+'<form id="login">'+emailField+'<label>Password'+passwordInputMarkup("password","Enter your password","current-password")+'</label><button class="primary">Sign in</button></form><button id="forgot" class="link-btn">Forgot password?</button></div></main>';
  bindPasswordToggles();
  document.querySelector("#staffMode").onclick=()=>renderLogin({app,supabase,boot,esc},"","staff-login");
  document.querySelector("#login").onsubmit=async e=>{e.preventDefault();const email=document.querySelector("#email").value.trim().toLowerCase(),password=document.querySelector("#password").value;const r=await supabase.auth.signInWithPassword({email,password});if(r.error)return renderLogin({app,supabase,boot,esc},r.error.message,"manager-login",email);await boot()};
  document.querySelector("#forgot").onclick=()=>renderLogin({app,supabase,boot,esc},"","request",document.querySelector("#email").value.trim().toLowerCase());
}


export function renderFirstLoginPassword({app,supabase,boot,esc}){
  app.dataset.authFlow="first-login";
  const brand='<div class="brand center"><strong>DIGITAL VISION</strong><small>BY ATELIER OG</small></div>';
  app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<h1>Set your password</h1><p class="muted">Choose a six-digit password to finish setting up your account.</p><form id="firstLoginPassword"><label>New password'+passwordInputMarkup("firstNewPassword","Enter 6-digit password","new-password",true)+'</label><label>Confirm password'+passwordInputMarkup("firstConfirmPassword","Re-enter 6-digit password","new-password",true)+'</label><button class="primary">Save password</button></form><button id="firstSignout" class="link-btn">Sign out</button></div></main>';
  bindPasswordToggles();
  document.querySelector("#firstSignout").onclick=async()=>{await supabase.auth.signOut();renderLogin({app,supabase,boot,esc})};
  document.querySelector("#firstLoginPassword").onsubmit=async e=>{
    e.preventDefault();
    const password=document.querySelector("#firstNewPassword").value,confirm=document.querySelector("#firstConfirmPassword").value;
    if(password!==confirm)return alert("The passwords do not match.");
    if(!isSixDigitPassword(password))return alert("Use exactly six digits for your password.");
    const btn=e.submitter;btn.disabled=true;btn.textContent="Saving...";
    const changed=await supabase.auth.updateUser({password});
    if(changed.error){btn.disabled=false;btn.textContent="Save password";return alert(changed.error.message)}
    const cleared=await supabase.functions.invoke("complete-first-login");
    if(cleared.error||cleared.data?.error){btn.disabled=false;btn.textContent="Save password";return alert("Password saved, but account setup could not be completed. Please contact the administrator. "+(cleared.data?.error||cleared.error?.message||""))}
    await supabase.auth.signOut();
    renderLogin({app,supabase,boot,esc},"Password set. Sign in with your new password.");
  };
}
