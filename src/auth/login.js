export function renderLogin({app,supabase,boot,esc},message="",mode="login",emailValue=""){
  app.dataset.authFlow = (mode === "request" || mode === "verify") ? "recovery" : "login";
  const safeMessage=message?'<div class="notice">'+esc(message)+'</div>':'';
  const brand='<div class="brand center"><strong>DIGITAL VISION</strong><small>BY ATELIER OG</small></div>';
  const emailField='<label>Email address<input id="email" type="email" required autocomplete="email" placeholder="you@example.com" value="'+esc(emailValue)+'"></label>';

  if(mode==="request"){
    app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<h1>Reset your password</h1><p class="muted">We’ll send a one-time recovery code to your registered email.</p>'+safeMessage+'<form id="recoveryRequest">'+emailField+'<button class="primary">Send recovery code</button></form><button id="backLogin" class="link-btn">Back to sign in</button></div></main>';
    document.querySelector("#backLogin").onclick=()=>renderLogin({app,supabase,boot,esc});
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
    app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<h1>Verify and change password</h1><p class="muted">Enter the recovery code sent to your email, then choose a new password.</p>'+safeMessage+'<form id="recoveryVerify">'+emailField+'<label>One-time code<input id="recoveryToken" inputmode="numeric" autocomplete="one-time-code" required minlength="6" maxlength="10" placeholder="Enter email code"></label><label>New password<input id="newPassword" type="password" autocomplete="new-password" required minlength="10" placeholder="At least 10 characters"></label><label>Confirm new password<input id="confirmPassword" type="password" autocomplete="new-password" required minlength="10" placeholder="Re-enter new password"></label><button class="primary">Verify code and save password</button></form><button id="resendCode" class="link-btn">Send a new code</button><button id="backLogin" class="link-btn">Back to sign in</button></div></main>';
    document.querySelector("#backLogin").onclick=()=>renderLogin({app,supabase,boot,esc});
    document.querySelector("#resendCode").onclick=()=>renderLogin({app,supabase,boot,esc},"Request a new recovery code below.","request",emailValue);
    document.querySelector("#recoveryVerify").onsubmit=async e=>{
      e.preventDefault();
      const email=document.querySelector("#email").value.trim().toLowerCase();
      const token=document.querySelector("#recoveryToken").value.trim();
      const password=document.querySelector("#newPassword").value;
      const confirm=document.querySelector("#confirmPassword").value;
      if(password!==confirm)return renderLogin({app,supabase,boot,esc},"The passwords do not match.","verify",email);
      if(password.length<10)return renderLogin({app,supabase,boot,esc},"Use a password with at least 10 characters.","verify",email);
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

  app.innerHTML='<main class="auth-page"><div class="auth-card">'+brand+'<h1>Sign in</h1>'+safeMessage+'<form id="login">'+emailField+'<label>Password<div class="password-field"><input id="password" type="password" required autocomplete="current-password" placeholder="Enter your password"><button type="button" id="togglePassword" class="password-toggle" aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></label><button class="primary">Sign in</button></form><button id="forgot" class="link-btn">Forgot password?</button></div></main>';
  const passwordInput=document.querySelector("#password");const toggle=document.querySelector("#togglePassword");
  toggle.onclick=()=>{const show=passwordInput.type==="password";passwordInput.type=show?"text":"password";toggle.setAttribute("aria-label",show?"Hide password":"Show password");toggle.setAttribute("aria-pressed",String(show));toggle.innerHTML=show?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.8 10.8 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.3 0 2.5-.3 3.5-.8"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'};
  document.querySelector("#login").onsubmit=async e=>{e.preventDefault();const email=document.querySelector("#email").value.trim().toLowerCase(),password=document.querySelector("#password").value;const r=await supabase.auth.signInWithPassword({email,password});if(r.error)return renderLogin({app,supabase,boot,esc},r.error.message);await boot()};
  document.querySelector("#forgot").onclick=()=>renderLogin({app,supabase,boot,esc},"","request",document.querySelector("#email").value.trim().toLowerCase());
}
