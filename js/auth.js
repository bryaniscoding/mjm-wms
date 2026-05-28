// ============================================================
//  auth.js — Supabase Auth + Role Management (admin/editor/viewer)
// ============================================================

const AUTH_URL  = 'https://xbyowjlrkfrvgaypucck.supabase.co/auth/v1';
const MGMT_URL  = 'https://xbyowjlrkfrvgaypucck.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhieW93amxya2ZydmdheXB1Y2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MTgwNzYsImV4cCI6MjA5NDk5NDA3Nn0.XdGf4T5st6fCGnnLs5cI0JMct2FuKDPYMztbWjgArEg';

// ── STATE ──────────────────────────────────────────────────────
let _session    = null;
let _userRole       = 'viewer'; // 'admin' | 'editor' | 'viewer'
let _userEmail      = '';
let _displayName    = '';
let _avatarUrl      = '';
let _moduleAccess   = []; // array of hidden page keys for this user

function getSession()  { return _session; }
function getUserRole() { return _userRole; }
function isAdmin()     { return _userRole === 'admin'; }
function isEditor()    { return _userRole === 'editor' || _userRole === 'admin'; }
function currentUser() { return _session?.user || null; }

// ── INIT ───────────────────────────────────────────────────────
async function initAuth() {
  const stored = localStorage.getItem('mjm_session');
  if (stored) {
    try {
      const parsed   = JSON.parse(stored);
      const now      = Math.floor(Date.now() / 1000);
      const payload  = JSON.parse(atob(parsed.access_token.split('.')[1]));
      if (payload.exp && payload.exp > now + 60) {
        // Token still valid — restore session then load role/profile
        applySession(parsed);
        await loadUserRole();
        return true;
      }
      // Token expired — try refresh
      const refreshed = await authRefresh(parsed.refresh_token);
      if (refreshed && !refreshed.error) {
        applySession(refreshed);
        await loadUserRole();
        return true;
      }
    } catch(e) { /* fall through to login screen */ }
  }
  localStorage.removeItem('mjm_session');
  return false;
}

async function authRefresh(refreshToken) {
  try {
    const res = await fetch(`${AUTH_URL}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.error ? null : data;
  } catch(e) { return null; }
}

function applySession(data) {
  _session   = data;
  _userEmail = data?.user?.email || '';
  localStorage.setItem('mjm_session', JSON.stringify(data));
  updateAuthHeaders(data.access_token);
  // Auto-register user in user_roles table so admin can see them
  _ensureUserRoleRecord(data.user?.id, data.user?.email);
  // Note: loadUserRole() must be called separately after this (it's async)
}

async function _ensureUserRoleRecord(uid, email) {
  if (!uid || !email) return;
  try {
    // Insert only if not exists (don't overwrite existing role)
    await fetch(`${MGMT_URL}/rest/v1/user_roles`, {
      method: 'POST',
      headers: {
        'apikey': SUPA_ANON,
        'Authorization': 'Bearer ' + (window._authToken || SUPA_ANON),
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=ignore-duplicates'
      },
      body: JSON.stringify({ user_id: uid, email, role: 'pending' })
    });
  } catch(e) { /* non-critical */ }
}

function updateAuthHeaders(token) {
  if (typeof HEADERS !== 'undefined') {
    HEADERS['Authorization'] = 'Bearer ' + token;
    HEADERS['apikey']        = SUPA_ANON;
  }
  window._authToken = token;
}

// ── ROLE: stored in Supabase user_roles table ─────────────────
async function loadUserRole() {
  const uid = _session?.user?.id;
  if (!uid) { _userRole = 'viewer'; return; }

  // Load from localStorage cache instantly (avoids flash of wrong role)
  const cached = localStorage.getItem('mjm_user_profile');
  if (cached) {
    try {
      const c = JSON.parse(cached);
      if (c.uid === uid) {
        _userRole    = c.role         || 'viewer';
        _displayName = c.displayName  || '';
        _avatarUrl   = c.avatarUrl    || '';
        _moduleAccess = c.moduleAccess || [];
      }
    } catch(e) { /* ignore bad cache */ }
  }

  // Then fetch fresh from Supabase and update
  try {
    const res = await fetch(`${MGMT_URL}/rest/v1/user_roles?user_id=eq.${uid}&select=role,display_name,avatar_url,module_access`, {
      headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + (window._authToken || SUPA_ANON) }
    });
    if (res.ok) {
      const data = await res.json();
      const roleFromDB = data[0]?.role || null;

      // No record = pending verification
      if (!data.length || !roleFromDB) {
        await authLogout();
        alert('⏳ Your account is pending admin verification.\n\nAn admin needs to approve your account before you can access the system. Please contact your administrator.');
        return;
      }

      // Blocked users cannot access
      if (roleFromDB === 'blocked') {
        await authLogout();
        alert('🚫 Your account has been deactivated.\n\nPlease contact your administrator.');
        return;
      }

      // Pending verification
      if (roleFromDB === 'pending') {
        await authLogout();
        alert('⏳ Your account is awaiting admin approval.\n\nAn admin needs to verify your account first. Please contact your administrator.');
        return;
      }

      _userRole     = roleFromDB;
      _displayName  = data[0]?.display_name  || '';
      _avatarUrl    = data[0]?.avatar_url    || '';
      _moduleAccess = data[0]?.module_access || [];
      // Cache for next reload
      localStorage.setItem('mjm_user_profile', JSON.stringify({
        uid, role: _userRole, displayName: _displayName,
        avatarUrl: _avatarUrl, moduleAccess: _moduleAccess,
      }));
    } else {
      // Can't reach user_roles — treat as pending
      await authLogout();
      alert('⏳ Your account is pending admin verification. Please contact your administrator.');
      return;
    }
  } catch(e) { /* keep cached values if network fails */ }
}

// ── LOGIN ──────────────────────────────────────────────────────
async function authLogin(email, password) {
  const res  = await fetch(`${AUTH_URL}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPA_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Login failed. Check your email and password.');
  applySession(data);
  await loadUserRole();
  return data;
}

// ── REGISTER ──────────────────────────────────────────────────
async function authRegister(email, password) {
  const res  = await fetch(`${AUTH_URL}/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPA_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Registration failed.');
  return data;
}

// ── LOGOUT ────────────────────────────────────────────────────
async function authLogout() {
  if (_session?.access_token) {
    await fetch(`${AUTH_URL}/logout`, {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + _session.access_token },
    }).catch(() => {});
  }
  _session = null; _userRole = 'viewer'; _userEmail = ''; _displayName = ''; _avatarUrl = ''; _moduleAccess = [];
  localStorage.removeItem('mjm_user_profile');
  localStorage.removeItem('mjm_session');
  showAuthScreen();
}

// ── AUTH SCREEN ───────────────────────────────────────────────
function showAuthScreen(defaultTab = 'login') {
  document.getElementById('app-root').style.display = 'none';
  let el = document.getElementById('auth-screen');
  if (!el) { el = document.createElement('div'); el.id = 'auth-screen'; document.body.appendChild(el); }
  el.style.display = 'flex';
  el.innerHTML = `
  <style>
    #auth-screen{position:fixed;inset:0;background:var(--bg-base);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:var(--font-body);}
    .auth-wrap{width:100%;max-width:440px;padding:20px;}
    .auth-card{background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--r-xl);padding:44px 40px;box-shadow:var(--shadow-card);}
    .auth-logo{display:flex;align-items:center;gap:14px;margin-bottom:32px;}
    .auth-logo-img{width:52px;height:52px;border-radius:var(--r-md);object-fit:cover;border:1.5px solid var(--border-default);box-shadow:0 4px 14px rgba(0,0,0,.15);flex-shrink:0;}
    .auth-logo-text{display:flex;flex-direction:column;gap:2px;}
    .auth-logo-title{font-family:var(--font-ui);font-size:20px;font-weight:800;color:var(--text-primary);letter-spacing:-0.01em;line-height:1.2;}
    .auth-logo-sub{font-size:12px;color:var(--accent-primary);font-weight:600;letter-spacing:0.04em;}
    .auth-tabs{display:flex;background:var(--bg-surface);border-radius:var(--r-md);padding:4px;margin-bottom:26px;border:1px solid var(--border-default);}
    .auth-tab{flex:1;padding:9px;background:none;border:none;font-family:var(--font-ui);font-size:13.5px;font-weight:500;color:var(--text-secondary);cursor:pointer;border-radius:var(--r-sm);transition:background .15s,color .15s;}
    .auth-tab.active{background:var(--bg-elevated);color:var(--accent-primary);font-weight:700;box-shadow:0 1px 6px rgba(0,0,0,.1);}
    .auth-field{margin-bottom:18px;}
    .auth-field label{display:block;font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:6px;letter-spacing:0.04em;text-transform:uppercase;font-family:var(--font-ui);}
    .auth-field input{width:100%;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--r-md);padding:11px 14px;font-family:var(--font-body);font-size:14px;color:var(--text-primary);outline:none;transition:border-color .15s,box-shadow .15s;}
    .auth-field input::placeholder{color:var(--text-tertiary);}
    .auth-field input:focus{border-color:var(--accent-primary);box-shadow:inset 0 0 0 3px rgba(139,105,20,.1);}
    .auth-btn{width:100%;background:var(--accent-primary);color:#fff;border:none;padding:13px;border-radius:var(--r-md);font-family:var(--font-ui);font-size:15px;font-weight:700;cursor:pointer;transition:all .16s;margin-top:6px;box-shadow:0 3px 12px rgba(139,105,20,.3);letter-spacing:.2px;}
    .auth-btn:hover{filter:brightness(1.08);transform:scale(1.01);}
    .auth-btn:active{transform:scale(.98);}
    .auth-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;}
    .auth-err{background:rgba(160,82,45,.08);border:1px solid rgba(160,82,45,.3);color:var(--accent-clay);border-radius:var(--r-md);padding:11px 14px;font-size:13px;margin-bottom:16px;display:none;font-family:var(--font-ui);}
    .auth-ok{background:rgba(92,122,92,.1);border:1px solid rgba(92,122,92,.3);color:var(--accent-sage);border-radius:var(--r-md);padding:11px 14px;font-size:13px;margin-bottom:16px;display:none;font-family:var(--font-ui);}
    .auth-note{font-size:12.5px;color:var(--text-secondary);text-align:center;margin-top:18px;line-height:1.7;}
    .auth-note strong{color:var(--text-primary);}
  </style>
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo">
        <img src="data:image/jpeg;base64,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" alt="MJM Groups" class="auth-logo-img"/>
        <div class="auth-logo-text">
          <div class="auth-logo-title">MJM Groups</div>
          <div class="auth-logo-sub">Worker Management Hub</div>
        </div>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab ${defaultTab==='login'?'active':''}"    id="tab-login"    onclick="switchAuthTab('login')">Sign In</button>
        <button class="auth-tab ${defaultTab==='register'?'active':''}" id="tab-register" onclick="switchAuthTab('register')">Register</button>
      </div>
      <div id="auth-error"   class="auth-err"></div>
      <div id="auth-success" class="auth-ok"></div>

      <div id="auth-panel-login" style="${defaultTab==='login'?'':'display:none'}">
        <div class="auth-field"><label>Email Address</label><input type="email" id="auth-email-login" placeholder="your@email.com" onkeydown="if(event.key==='Enter')doLogin()"/></div>
        <div class="auth-field">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label style="margin-bottom:0;">Password</label>
            <button type="button" onclick="switchAuthTab('reset')" style="background:none;border:none;font-size:12px;color:var(--accent-primary);cursor:pointer;font-family:var(--font-ui);font-weight:600;padding:0;text-decoration:underline;">Forgot password?</button>
          </div>
          <input type="password" id="auth-pw-login" placeholder="Your password" onkeydown="if(event.key==='Enter')doLogin()"/>
        </div>
        <button class="auth-btn" id="login-btn" onclick="doLogin()">Sign In</button>
        <p class="auth-note">New here? Click <strong>Register</strong> to create an account.</p>
      </div>

      <div id="auth-panel-register" style="${defaultTab==='register'?'':'display:none'}">
        <div class="auth-field"><label>Email Address</label><input type="email" id="auth-email-reg" placeholder="your@email.com"/></div>
        <div class="auth-field"><label>Password <span style="font-size:11px;color:var(--text-tertiary);">(min 6 characters)</span></label><input type="password" id="auth-pw-reg" placeholder="Create a password" onkeydown="if(event.key==='Enter')doRegister()"/></div>
        <button class="auth-btn" id="register-btn" onclick="doRegister()">Create Account</button>
        <p class="auth-note">After registering, check your email to confirm your account, then sign in.</p>
      </div>

      <div id="auth-panel-reset" style="display:none;">
        <p style="font-size:13.5px;color:var(--text-secondary);margin-bottom:18px;line-height:1.7;">Enter your email address and we will send you a link to reset your password.</p>
        <div class="auth-field"><label>Email Address</label><input type="email" id="auth-email-reset" placeholder="your@email.com" onkeydown="if(event.key==='Enter')doResetPassword()"/></div>
        <button class="auth-btn" id="reset-btn" onclick="doResetPassword()">Send Reset Link</button>
        <p class="auth-note" style="margin-top:14px;">
          <button type="button" onclick="switchAuthTab('login')" style="background:none;border:none;color:var(--accent-primary);cursor:pointer;font-family:var(--font-ui);font-weight:600;font-size:13px;text-decoration:underline;">← Back to Sign In</button>
        </p>
      </div>
    </div>
  </div>`;
}

function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active',    tab==='login');
  document.getElementById('tab-register').classList.toggle('active', tab==='register');
  document.getElementById('auth-panel-login').style.display    = tab==='login'    ? '' : 'none';
  document.getElementById('auth-panel-register').style.display = tab==='register' ? '' : 'none';
  document.getElementById('auth-panel-reset').style.display    = tab==='reset'    ? '' : 'none';
  document.getElementById('auth-error').style.display   = 'none';
  document.getElementById('auth-success').style.display = 'none';
}

function setAuthError(msg)   { const el=document.getElementById('auth-error');   el.textContent=msg; el.style.display='block'; document.getElementById('auth-success').style.display='none'; }
function setAuthSuccess(msg) { const el=document.getElementById('auth-success'); el.textContent=msg; el.style.display='block'; document.getElementById('auth-error').style.display='none'; }

async function doResetPassword() {
  const email = document.getElementById('auth-email-reset')?.value.trim();
  if (!email) { setAuthError('Please enter your email address.'); return; }
  const btn = document.getElementById('reset-btn');
  if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }
  try {
    const res = await fetch(`${AUTH_URL}/recover`, {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    // Supabase returns 200 even if email not found (security best practice)
    setAuthSuccess('✅ If an account exists for that email, a password reset link has been sent. Check your inbox.');
    if (btn) { btn.textContent = 'Send Reset Link'; btn.disabled = false; }
    document.getElementById('auth-email-reset').value = '';
  } catch(e) {
    setAuthError('Failed to send reset email. Please try again.');
    if (btn) { btn.textContent = 'Send Reset Link'; btn.disabled = false; }
  }
}

async function doLogin() {
  const email = document.getElementById('auth-email-login')?.value.trim();
  const pw    = document.getElementById('auth-pw-login')?.value;
  if (!email || !pw) { setAuthError('Please enter your email and password.'); return; }
  const btn = document.getElementById('login-btn');
  if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }
  try {
    await authLogin(email, pw);
    hideAuthScreen();
    applyRoleUI();
    await loadData();
    populateLeaveFilters();
    navigateTo('dashboard');
    initPresence();
  } catch(e) {
    setAuthError(e.message);
    if (btn) { btn.textContent = 'Sign In'; btn.disabled = false; }
  }
}

async function doRegister() {
  const email = document.getElementById('auth-email-reg')?.value.trim();
  const pw    = document.getElementById('auth-pw-reg')?.value;
  if (!email || !pw) { setAuthError('Please enter your email and password.'); return; }
  if (pw.length < 6) { setAuthError('Password must be at least 6 characters.'); return; }
  const btn = document.getElementById('register-btn');
  if (btn) { btn.textContent = 'Creating account…'; btn.disabled = true; }
  try {
    await authRegister(email, pw);
    setAuthSuccess('✅ Account created! Check your email to confirm, then sign in.');
    if (btn) { btn.textContent = 'Create Account'; btn.disabled = false; }
    switchAuthTab('login');
  } catch(e) {
    setAuthError(e.message);
    if (btn) { btn.textContent = 'Create Account'; btn.disabled = false; }
  }
}

function hideAuthScreen() {
  const el = document.getElementById('auth-screen');
  if (el) el.style.display = 'none';
  document.getElementById('app-root').style.display = '';
}

// ── ROLE-BASED UI ─────────────────────────────────────────────
function applyRoleUI() {
  const user = currentUser();
  const body = document.body;

  // Apply role class to body — CSS handles hiding
  body.classList.remove('role-admin','role-editor','role-viewer');
  body.classList.add('role-' + _userRole);

  // Apply module access — hide nav items for pages in _moduleAccess
  const ALL_MODULES = ['worker-list','doc-status','doc-application','ap-quota','leave-applications','leave-status','financial-report','settings','user-management'];
  ALL_MODULES.forEach(page => {
    const navEl = document.querySelector(`[data-page="${page}"]`);
    if (!navEl) return;
    const hidden = !isAdmin() && Array.isArray(_moduleAccess) && _moduleAccess.includes(page);
    navEl.style.display = hidden ? 'none' : '';
  });

  const displayName = _displayName || _userEmail.split('@')[0] || 'User';
  const initials    = displayName.trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?';
  const roleColors  = { admin:'#1a8c01', editor:'#d4820a', viewer:'#1460aa' };
  const roleColor   = roleColors[_userRole] || '#8aaa82';
  const roleBg      = { admin:'var(--green-light)', editor:'var(--amber-bg)', viewer:'var(--blue-bg)' }[_userRole] || 'var(--offwhite2)';

  // Helper to set avatar element (image or initials)
  function setAvatar(el, imgEl) {
    if (!el) return;
    if (_avatarUrl) {
      el.innerHTML = `<img src="${_avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;
    } else {
      el.textContent = initials;
      el.style.background = roleColor;
    }
  }

  // Topbar avatar + username
  const topbarAvatar = document.getElementById('topbar-avatar');
  const topbarUser   = document.getElementById('topbar-username');
  setAvatar(topbarAvatar);
  if (topbarUser) topbarUser.textContent = displayName;

  // Dropdown info
  const ddAvatar = document.getElementById('dd-avatar');
  const ddName   = document.getElementById('dd-name');
  const ddEmail  = document.getElementById('dd-email');
  const ddRole   = document.getElementById('dd-role');
  setAvatar(ddAvatar);
  if (ddName)  ddName.textContent  = displayName;
  if (ddEmail) ddEmail.textContent = _userEmail;
  if (ddRole)  {
    ddRole.textContent   = _userRole;
    ddRole.style.background = roleBg;
    ddRole.style.color      = roleColor;
  }

  // Sidebar footer
  const sbAvatar = document.getElementById('sidebar-avatar');
  const sbName   = document.getElementById('sidebar-display-name');
  const sbRole   = document.getElementById('sidebar-role');
  setAvatar(sbAvatar);
  if (sbName) sbName.textContent = displayName;
  if (sbRole) { sbRole.textContent = _userRole; sbRole.style.color = roleColor; }
}

// ── SIDEBAR TOGGLE ────────────────────────────────────────────
let _sidebarCollapsed = false;

function isMobileView() { return window.innerWidth <= 900; }

function toggleSidebarCollapse() {
  const sidebar  = document.getElementById('sidebar');
  const main     = document.querySelector('.main-content');
  const overlay  = document.getElementById('sidebar-overlay');

  if (isMobileView()) {
    // On mobile: toggle .open class, show/hide overlay
    const isOpen = sidebar?.classList.contains('open');
    sidebar?.classList.toggle('open', !isOpen);
    document.body.classList.toggle('sidebar-open', !isOpen);
    if (overlay) overlay.style.display = isOpen ? 'none' : 'block';
  } else {
    // On desktop: collapse to hidden
    _sidebarCollapsed = !_sidebarCollapsed;
    sidebar?.classList.toggle('collapsed', _sidebarCollapsed);
    main?.classList.toggle('sidebar-collapsed', _sidebarCollapsed);
    localStorage.setItem('mjm_sidebar_collapsed', _sidebarCollapsed ? '1' : '0');
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar?.classList.remove('open');
  document.body.classList.remove('sidebar-open');
  if (overlay) overlay.style.display = 'none';
}

function restoreSidebarState() {
  if (isMobileView()) return; // never auto-restore on mobile
  const saved = localStorage.getItem('mjm_sidebar_collapsed');
  if (saved === '1') {
    _sidebarCollapsed = true;
    document.getElementById('sidebar')?.classList.add('collapsed');
    document.querySelector('.main-content')?.classList.add('sidebar-collapsed');
  }
}

// ── USER MANAGEMENT PAGE ──────────────────────────────────────
let _allUsers     = [];
let _changingUserId = null;
const SUPA_SERVICE_ROLE_NOTE = ''; // service role key needed for listing users

async function loadAllUsers() {
  // Clear search filters so all users show by default
  const searchEl = document.getElementById('userMgmtSearch');
  const roleEl   = document.getElementById('userRoleFilter');
  if (searchEl) searchEl.value = '';
  if (roleEl)   roleEl.value   = '';

  try {
    const res = await fetch(`${MGMT_URL}/rest/v1/user_roles?select=user_id,role,email,created_at,module_access&order=created_at.desc`, {
      headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + (window._authToken || SUPA_ANON) }
    });
    if (res.ok) { _allUsers = await res.json(); }
    else _allUsers = [];
  } catch(e) { _allUsers = []; }
  renderUserMgmtTable();
}

function filterUsers()      { renderUserMgmtTable(); }
function clearUserFilters() { ['userMgmtSearch','userRoleFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); renderUserMgmtTable(); }

function renderUserMgmtTable() {
  const query  = (document.getElementById('userMgmtSearch')?.value || '').toLowerCase().trim();
  const roleF  = document.getElementById('userRoleFilter')?.value || '';
  const tbody  = document.getElementById('user-mgmt-table-body');
  if (!tbody) return;

  let rows = _allUsers;
  if (query) rows = rows.filter(u => (u.email||'').toLowerCase().includes(query));
  if (roleF) rows = rows.filter(u => u.role === roleF);

  const roleColor = { admin:'var(--accent-clay)', editor:'var(--accent-primary)', viewer:'var(--accent-sage)', pending:'#888', blocked:'#c00' };
  const roleBg    = { admin:'rgba(160,82,45,.1)', editor:'rgba(139,105,20,.1)', viewer:'rgba(92,122,92,.1)', pending:'rgba(150,150,150,.1)', blocked:'rgba(200,0,0,.1)' };

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">👥</div><p>No users found.</p></div></td></tr>`;
    document.getElementById('user-mgmt-count').textContent = ''; return;
  }
  tbody.innerHTML = rows.map(u => {
    const isPending = u.role === 'pending';
    const isBlocked = u.role === 'blocked';
    const statusBadge = isPending
      ? `<span class="legal-status-badge" style="background:rgba(150,150,150,.12);color:#888;">⏳ Pending Approval</span>`
      : isBlocked
        ? `<span class="legal-status-badge ls-expired">🚫 Blocked</span>`
        : `<span class="legal-status-badge ls-active">✓ Active</span>`;
    return `<tr>
      <td>${esc(u.email || '—')}</td>
      <td><span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${roleBg[u.role]||'var(--offwhite2)'};color:${roleColor[u.role]||'var(--text3)'};">${esc(u.role||'viewer')}</span></td>
      <td>${statusBadge}</td>
      <td style="font-size:12.5px;color:var(--text3);">${u.created_at ? new Date(u.created_at).toLocaleDateString('en-MY') : '—'}</td>
      <td><div class="action-group">
        <button class="action-btn" title="Change Role" onclick="openChangeRoleModal('${u.user_id}','${esc(u.email||'')}','${u.role||'viewer'}',${JSON.stringify(u.module_access||[])})">✏️</button>
        <button class="action-btn danger" title="Remove User" onclick="confirmDeleteUser('${u.user_id}','${esc(u.email||'')}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
  document.getElementById('user-mgmt-count').textContent = ` ${rows.length} user${rows.length!==1?'s':''}`;
}

// Invite user — uses Supabase invite endpoint
async function sendUserInvite() {
  const name    = document.getElementById('invite_name')?.value.trim()  || '';
  const email   = document.getElementById('invite_email')?.value.trim() || '';
  const tempPw  = document.getElementById('invite_temp_pw')?.value      || '';
  const role    = document.getElementById('invite_role')?.value         || 'viewer';
  const errEl   = document.getElementById('inviteError');
  const okEl    = document.getElementById('inviteSuccess');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  if (!email)          { errEl.textContent = 'Email is required.';                    errEl.style.display='block'; return; }
  if (!tempPw)         { errEl.textContent = 'Temporary password is required.';       errEl.style.display='block'; return; }
  if (tempPw.length<6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display='block'; return; }

  // Get hidden modules from checkboxes
  const hiddenModules = [];
  document.querySelectorAll('.module-access-cb').forEach(cb => {
    if (!cb.checked) hiddenModules.push(cb.dataset.page);
  });

  const btn = document.getElementById('invite-submit-btn');
  if (btn) { btn.textContent = 'Creating…'; btn.disabled = true; }

  try {
    // 1. Create auth account via Supabase signUp
    const signUpRes = await fetch(`${AUTH_URL}/signup`, {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: tempPw }),
    });
    const signUpData = await signUpRes.json();
    if (!signUpRes.ok) throw new Error(signUpData.error_description || signUpData.msg || 'Account creation failed.');

    const uid = signUpData.user?.id || signUpData.id;
    if (!uid) throw new Error('Could not get user ID from Supabase response.');

    // 2. Upsert role + name + module access into user_roles
    await fetch(`${MGMT_URL}/rest/v1/user_roles`, {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + (window._authToken||SUPA_ANON), 'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: uid, email, role, display_name: name||null, module_access: hiddenModules })
    });

    okEl.textContent = `✅ Account created for ${email}. Share their temporary password: ${tempPw}`;
    okEl.style.display = 'block';
    if (btn) { btn.textContent = 'Create Account'; btn.disabled = false; }
    loadAllUsers();

  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
    if (btn) { btn.textContent = 'Create Account'; btn.disabled = false; }
  }
}

// ── DELETE USER FROM user_roles ──────────────────────────────
let _deletingUserId = null;
function confirmDeleteUser(userId, email, currentRole) {
  _deletingUserId = userId;
  if (currentRole === 'blocked') {
    if (confirm(`Unblock ${email}?\n\nThis will restore their access as a Viewer.`)) {
      unblockUser(userId);
    }
  } else {
    if (confirm(`Block ${email}?\n\nThey will immediately lose access to the system. You can unblock them later.`)) {
      deleteUserRole(userId);
    }
  }
}

async function unblockUser(userId) {
  try {
    const res = await fetch(`${MGMT_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + (window._authToken || SUPA_ANON), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ role: 'viewer' })
    });
    if (res.ok) { showToast('User unblocked — restored as Viewer.'); loadAllUsers(); }
    else showToast('Failed to unblock user.', true);
  } catch(e) { showToast('Error: ' + e.message, true); }
}

async function deleteUserRole(userId) {
  try {
    // Mark as 'blocked' so they cannot log in — actual auth deletion needs service role key
    const res = await fetch(`${MGMT_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + (window._authToken || SUPA_ANON), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ role: 'blocked' })
    });
    if (res.ok) {
      showToast('User blocked — they can no longer access the system.');
      loadAllUsers();
    } else {
      showToast('Failed to block user.', true);
    }
  } catch(e) {
    showToast('Error: ' + e.message, true);
  }
}

function openInviteUserModal() {
  ['invite_name','invite_email','invite_temp_pw'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('invite_role').value = 'viewer';
  // Reset all module checkboxes to checked (all visible)
  document.querySelectorAll('.module-access-cb').forEach(cb => cb.checked = true);
  document.getElementById('inviteError').style.display='none';
  document.getElementById('inviteSuccess').style.display='none';
  openModal('inviteUserModal');
}
function closeInviteUserModal()     { closeModal('inviteUserModal'); }
function closeInviteUserModalOutside(e) { closeModalOutsideStack(e, 'inviteUserModal'); }

function openChangeRoleModal(userId, email, currentRole, moduleAccess) {
  _changingUserId = userId;
  document.getElementById('changeRoleEmail').textContent   = email;
  document.getElementById('change_role_select').value      = currentRole;
  document.getElementById('changeRoleError').style.display = 'none';
  // Set module access checkboxes
  const hidden = Array.isArray(moduleAccess) ? moduleAccess : (moduleAccess ? JSON.parse(moduleAccess) : []);
  document.querySelectorAll('.module-access-cb-edit').forEach(cb => {
    cb.checked = !hidden.includes(cb.dataset.page);
  });
  openModal('changeRoleModal');
}
function closeChangeRoleModal()     { closeModal('changeRoleModal'); _changingUserId=null; }
function closeChangeRoleModalOutside(e) { closeModalOutsideStack(e, 'changeRoleModal'); }

async function saveUserRole() {
  const newRole = document.getElementById('change_role_select')?.value;
  const errEl   = document.getElementById('changeRoleError');
  errEl.style.display = 'none';
  // Get hidden modules
  const hiddenModules = [];
  document.querySelectorAll('.module-access-cb-edit').forEach(cb => {
    if (!cb.checked) hiddenModules.push(cb.dataset.page);
  });
  try {
    const res = await fetch(`${MGMT_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(_changingUserId)}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + (window._authToken||SUPA_ANON), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ role: newRole, module_access: hiddenModules })
    });
    if (!res.ok) throw new Error('Update failed');
    closeChangeRoleModal(); loadAllUsers();
    showToast('Role and access updated successfully.');
  } catch(e) {
    errEl.textContent = 'Failed: ' + e.message; errEl.style.display = 'block';
  }
}

// ══════════════════════════════════════════════════════════════
//  PROFILE MODAL
// ══════════════════════════════════════════════════════════════

function toggleProfileDropdown() {
  const dd = document.getElementById('profile-dropdown');
  if (!dd) return;
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}
function closeProfileDropdown() {
  const dd = document.getElementById('profile-dropdown');
  if (dd) dd.style.display = 'none';
}

let _profilePhotoBase64 = null;
let _removePhoto        = false;

function openProfileModal() {
  closeProfileDropdown();
  _profilePhotoBase64 = null;
  _removePhoto        = false;

  // Populate fields
  document.getElementById('profile-display-name').value = _displayName || '';
  document.getElementById('profile-email').value        = _userEmail   || '';
  document.getElementById('profile-role').value         = _userRole    || '';
  document.getElementById('profile-new-pw').value       = '';
  document.getElementById('profile-confirm-pw').value   = '';
  document.getElementById('profileError').style.display   = 'none';
  document.getElementById('profileSuccess').style.display = 'none';

  // Avatar preview
  const preview  = document.getElementById('profile-photo-preview');
  const initials = document.getElementById('profile-initials');
  if (_avatarUrl) {
    preview.src = _avatarUrl; preview.style.display = 'block';
    initials.style.display = 'none';
  } else {
    preview.style.display  = 'none';
    initials.style.display = 'flex';
    initials.textContent   = (_displayName || _userEmail).trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?';
  }
  openModal('profileModal');
}

function closeProfileModal() { closeModal('profileModal'); }
function closeProfileModalOutside(e) { closeModalOutsideStack(e, 'profileModal'); }

function previewProfilePhoto(event) {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    document.getElementById('profileError').textContent = 'Photo must be under 2MB.';
    document.getElementById('profileError').style.display = 'block'; return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    _profilePhotoBase64 = e.target.result;
    _removePhoto = false;
    document.getElementById('profile-photo-preview').src          = e.target.result;
    document.getElementById('profile-photo-preview').style.display = 'block';
    document.getElementById('profile-initials').style.display      = 'none';
  };
  reader.readAsDataURL(file);
}

function removeProfilePhoto() {
  _profilePhotoBase64 = null; _removePhoto = true;
  document.getElementById('profile-photo-preview').style.display = 'none';
  document.getElementById('profile-initials').style.display      = 'flex';
  document.getElementById('profile-initials').textContent        =
    (_displayName || _userEmail).trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?';
}

async function saveProfile() {
  const newName   = document.getElementById('profile-display-name').value.trim();
  const newPw     = document.getElementById('profile-new-pw').value;
  const confirmPw = document.getElementById('profile-confirm-pw').value;
  const errEl     = document.getElementById('profileError');
  const okEl      = document.getElementById('profileSuccess');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  if (newPw && newPw.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
  if (newPw && newPw !== confirmPw) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }

  const uid   = _session?.user?.id; if (!uid) return;
  const token = window._authToken || SUPA_ANON;

  try {
    // Update display_name and avatar in user_roles
    const avatarToSave = _removePhoto ? null : (_profilePhotoBase64 || _avatarUrl || null);
    const patchRes = await fetch(`${MGMT_URL}/rest/v1/user_roles?user_id=eq.${uid}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ display_name: newName || null, avatar_url: avatarToSave })
    });
    if (!patchRes.ok) throw new Error('Failed to save profile.');

    // Change password if provided
    if (newPw) {
      const pwRes = await fetch(`${AUTH_URL}/user`, {
        method: 'PUT',
        headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw })
      });
      if (!pwRes.ok) { const d = await pwRes.json(); throw new Error(d.error_description || 'Password update failed.'); }
    }

    // Update local state
    _displayName = newName;
    _avatarUrl   = avatarToSave || '';
    applyRoleUI();
    // Update localStorage cache
    localStorage.setItem('mjm_user_profile', JSON.stringify({
      uid: _session?.user?.id, role: _userRole,
      displayName: _displayName, avatarUrl: _avatarUrl, moduleAccess: _moduleAccess,
    }));

    okEl.textContent = '✅ Profile saved successfully!'; okEl.style.display = 'block';
    document.getElementById('profile-new-pw').value     = '';
    document.getElementById('profile-confirm-pw').value = '';
    setTimeout(() => closeProfileModal(), 1500);

  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  }
}

// ══════════════════════════════════════════════════════════════
//  REALTIME PRESENCE — who's online right now
// ══════════════════════════════════════════════════════════════
let _presenceChannel = null;

async function initPresence() {
  const user = currentUser(); if (!user) return;
  const displayName = _displayName || _userEmail.split('@')[0] || 'User';

  async function heartbeat() {
    try {
      // First ensure the row exists
      await fetch(`${MGMT_URL}/rest/v1/user_roles`, {
        method: 'POST',
        headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + (window._authToken || SUPA_ANON), 'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: user.id, email: _userEmail, role: _userRole || 'viewer', last_seen: new Date().toISOString() })
      });
      // Then update last_seen
      await fetch(`${MGMT_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + (window._authToken || SUPA_ANON), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ last_seen: new Date().toISOString() })
      });
    } catch(e) { /* ignore */ }
  }

  async function fetchActiveUsers() {
    try {
      // Active = last seen within last 3 minutes
      const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const res = await fetch(
        `${MGMT_URL}/rest/v1/user_roles?last_seen=gte.${encodeURIComponent(cutoff)}&role=neq.blocked&role=neq.pending&select=user_id,display_name,role,avatar_url,email`,
        { headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + (window._authToken || SUPA_ANON) } }
      );
      if (!res.ok) { console.warn('Presence fetch failed:', res.status); return; }
      const users = await res.json();
      // Always include current user even if last_seen not updated yet
      const myId  = user.id;
      const hasSelf = users.some(u => u.user_id === myId);
      if (!hasSelf) users.unshift({ user_id: myId, display_name: displayName, role: _userRole, avatar_url: _avatarUrl });
      renderPresenceBox(users);
    } catch(e) { console.warn('Presence error:', e); }
  }

  // Run immediately
  await heartbeat();
  await fetchActiveUsers();

  // Poll every 20 seconds (faster so second user shows up quickly)
  if (window._presenceInterval) clearInterval(window._presenceInterval);
  window._presenceInterval = setInterval(async () => {
    await heartbeat();
    await fetchActiveUsers();
  }, 20000);
}

function renderPresenceBox(users) {
  const countEl   = document.getElementById('presence-count');
  const avatarsEl = document.getElementById('presence-avatars');
  const boxEl     = document.getElementById('presence-box');
  if (!countEl || !avatarsEl) return;

  const count = users.length;
  // Update count text
  countEl.textContent = `${count} online`;

  // Build avatar chips — show up to 5, overlap them Google-Docs style
  const colours = { admin:'#8B6914', editor:'#5C7A5C', viewer:'#9A8778' };
  avatarsEl.style.cssText = 'display:flex;align-items:center;margin-left:6px;';
  avatarsEl.innerHTML = users.slice(0,5).map((u, i) => {
    const name     = u.display_name || u.email || '?';
    const initials = name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
    const bg       = colours[u.role] || '#9A8778';
    const zIdx     = 10 - i;
    const ml       = i === 0 ? '0' : '-6px';
    const chipStyle = `width:24px;height:24px;border-radius:50%;border:2px solid var(--bg-elevated);margin-left:${ml};z-index:${zIdx};position:relative;flex-shrink:0;overflow:hidden;cursor:default;box-shadow:0 1px 4px rgba(0,0,0,.15);`;
    if (u.avatar_url && u.avatar_url.startsWith('data:')) {
      return `<img src="${u.avatar_url}" title="${esc(name)}" style="${chipStyle}object-fit:cover;"/>`;
    }
    return `<div title="${esc(name)}" style="${chipStyle}background:${bg};color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:var(--font-ui);">${esc(initials)}</div>`;
  }).join('');

  // Show "+N more" if more than 5
  if (users.length > 5) {
    avatarsEl.innerHTML += `<div style="width:24px;height:24px;border-radius:50%;background:var(--bg-surface);border:2px solid var(--border-default);margin-left:-6px;z-index:5;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--text-secondary);font-family:var(--font-ui);">+${users.length-5}</div>`;
  }
}