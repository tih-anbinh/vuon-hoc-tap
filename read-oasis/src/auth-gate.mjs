// Author: Huy Tran
// Email: hqt.msg@gmail.com
// Created: 2026-09-28
//
// Family login gate (Supabase auth + toan3_profiles approval), shared by index.html and parent.html.
// Same accounts and approval flow as toan3.html: an account only passes when public.toan3_profiles.approved = true.
//
// Flow:
//  1. Fast path (no network, no SDK): a recent approval stamp in sessionStorage (`ro.auth.ok`, same account as the
//     cached Supabase session) lets the page render right away. This is what makes index.html -> parent.html
//     seamless: the child app already verified the account in this browser tab session.
//  2. Otherwise verify online: getSession() -> toan3_profiles.approved. Approved -> stamp + resolve.
//     Signed in but not approved -> signOut + show gate with the "waiting for approval" note.
//  3. Offline / file:// with a cached session -> let the page through (local-first app; cloud is optional).
//  4. No session -> full-screen gate (login / register) until a verified, approved sign-in succeeds.
//
// The gate is a modal overlay injected into <body>, styled by .auth-gate in assets/app.css.

import { getClient, cachedSessionUser, signIn, signOut } from './sync.mjs';
import { h, icon, isFileProtocol } from './ui.mjs';

const OK_KEY = 'ro.auth.ok';              // sessionStorage: { id, name, ts } after a verified approved check
const OK_TTL_MS = 12 * 60 * 60 * 1000;    // re-verify at most twice a day per tab session
const PROFILE_TABLE = 'toan3_profiles';

const MSG = {
  need: 'Please enter your email and password.',
  bad: 'Wrong email or password.',
  unconfirmed: 'This email is not confirmed yet. Please check your inbox.',
  net: 'Connection problem. Check the network and try again.',
  pending: 'Your account is waiting for admin approval. Please try again later.',
  registered: 'Account created! It now waits for admin approval before you can sign in.',
  offline: 'You are offline. Sign in once while online, then the app works offline too.',
  pwShort: 'Password needs at least 6 characters.',
};

function readOk() {
  try { const j = JSON.parse(sessionStorage.getItem(OK_KEY) || 'null'); return j && j.id && (Date.now() - (j.ts || 0)) < OK_TTL_MS ? j : null; } catch { return null; }
}
function writeOk(u) { try { sessionStorage.setItem(OK_KEY, JSON.stringify({ id: u.id, email: u.email, name: u.name || '', ts: Date.now() })); } catch { /* private mode */ } }
export function clearOk() { try { sessionStorage.removeItem(OK_KEY); } catch { /* ignore */ } }

/** Returns { approved, name } for the signed-in user, or throws on network/RLS errors. */
async function fetchProfile(client, userId) {
  const { data, error } = await client.from(PROFILE_TABLE).select('approved, full_name').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return { approved: !!data?.approved, name: data?.full_name || '' };
}

function mapAuthError(e) {
  const m = String(e?.message || e || '').toLowerCase();
  if (m.includes('invalid login')) return MSG.bad;
  if (m.includes('email not confirmed')) return MSG.unconfirmed;
  if (m.includes('offline') || m.includes('fetch') || m.includes('network') || m.includes('load supabase')) return MSG.net;
  return e?.message || MSG.net;
}

/**
 * Gate the page. Resolves with { id, email, name } once an approved account is present.
 * `page` is 'kid' | 'parent' and only affects copy on the card.
 */
export function requireAuth({ page = 'kid' } = {}) {
  return new Promise(resolve => {
    const done = (u) => { writeOk(u); removeGate(); resolve(u); };

    // 1. fast path: verified earlier in this tab session for the same cached account
    const cached = cachedSessionUser();
    const ok = readOk();
    if (cached && ok && ok.id === cached.id) return resolve({ id: cached.id, email: cached.email, name: ok.name || '' });

    // 3. offline / file: local-first; trust the cached session, otherwise show the gate with an offline note
    if (isFileProtocol || !navigator.onLine) {
      if (cached) return resolve({ id: cached.id, email: cached.email, name: '' });
      return showGate({ page, done, note: MSG.offline });
    }

    // 2. online verification
    (async () => {
      try {
        const c = await getClient();
        const { data: { session } } = await c.auth.getSession();
        if (!session) return showGate({ page, done });
        const p = await fetchProfile(c, session.user.id);
        if (p.approved) return done({ id: session.user.id, email: session.user.email, name: p.name });
        await signOut(); clearOk();
        return showGate({ page, done, error: MSG.pending });
      } catch (e) {
        // SDK failed to load / transient network error: fall back like offline, never brick the app for a known account
        if (cached) return resolve({ id: cached.id, email: cached.email, name: '' });
        return showGate({ page, done, error: mapAuthError(e) });
      }
    })();
  });
}

/** Sign out everywhere (Supabase session + approval stamp + parent unlock) and reload to the gate. */
export async function signOutAndReload() {
  clearOk();
  try { sessionStorage.removeItem('ro.parent.unlocked'); } catch { /* ignore */ }
  await signOut();
  location.reload();
}

// ---------- gate UI
let gateEl = null;
function removeGate() { if (gateEl) { gateEl.remove(); gateEl = null; } document.body.classList.remove('locked'); }

function showGate({ page, done, error = '', note = '' }) {
  removeGate();
  let mode = 'login';
  const err = h('p', { class: 'auth-err', role: 'alert', text: error || '' });
  const okMsg = h('p', { class: 'auth-ok', 'aria-live': 'polite' });
  const email = h('input', { type: 'email', autocomplete: 'username', inputmode: 'email', placeholder: 'parent@example.com', required: true, id: 'authEmail' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••', required: true, minlength: 6, id: 'authPass' });
  const name = h('input', { type: 'text', autocomplete: 'name', placeholder: 'e.g. Mom of An', id: 'authName' });
  const nameField = h('label', { class: 'auth-field hidden', for: 'authName' }, h('span', { text: 'Your name' }), name);
  const submit = h('button', { class: 'primary auth-btn', type: 'submit' }, h('span', { text: 'Sign in' }));
  const toggle = h('button', { class: 'auth-toggle', type: 'button', text: 'New here? Create an account' });
  const subtitle = h('p', { class: 'auth-sub', text: page === 'parent' ? 'Sign in with the family account to open the parent area.' : 'Sign in with the family account to open the reading garden.' });
  const busy = (on) => { submit.disabled = on; toggle.disabled = on; submit.firstChild.textContent = on ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'; };
  const setErr = (t) => { err.textContent = t; okMsg.textContent = ''; };
  const setOk = (t) => { okMsg.textContent = t; err.textContent = ''; };
  const setMode = (m) => {
    mode = m; setErr('');
    nameField.classList.toggle('hidden', m !== 'register');
    pass.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    submit.firstChild.textContent = m === 'login' ? 'Sign in' : 'Create account';
    toggle.textContent = m === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in';
  };
  toggle.onclick = () => setMode(mode === 'login' ? 'register' : 'login');

  const form = h('form', { class: 'auth-card', novalidate: true, 'aria-labelledby': 'authTitle' },
    h('div', { class: 'auth-head' },
      icon('mascot', 'auth-mascot'),
      h('h2', { id: 'authTitle', text: 'Read Oasis' }),
      subtitle),
    err, okMsg,
    nameField,
    h('label', { class: 'auth-field', for: 'authEmail' }, h('span', { text: 'Email' }), email),
    h('label', { class: 'auth-field', for: 'authPass' }, h('span', { text: 'Password' }), pass),
    submit,
    toggle,
    h('p', { class: 'auth-note', text: note || 'One family account for all the learning apps. New accounts are approved by the admin first.' }));

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const em = email.value.trim(), pw = pass.value;
    if (!em || !pw) return setErr(MSG.need);
    if (!navigator.onLine) return setErr(MSG.offline);
    busy(true);
    try {
      if (mode === 'register') {
        if (pw.length < 6) throw new Error(MSG.pwShort);
        const c = await getClient();
        const { error } = await c.auth.signUp({ email: em, password: pw, options: { data: { full_name: name.value.trim() } } });
        if (error) throw error;
        // profile row is auto-created with approved=false by the DB trigger; a session may exist but is useless until approved
        await signOut();
        setMode('login'); setOk(MSG.registered); pass.value = '';
      } else {
        const u = await signIn(em, pw);
        const c = await getClient();
        const p = await fetchProfile(c, u.id);
        if (!p.approved) { await signOut(); clearOk(); throw new Error(MSG.pending); }
        done({ id: u.id, email: u.email, name: p.name });
      }
    } catch (e) {
      setErr(e?.message === MSG.pending || e?.message === MSG.pwShort ? e.message : mapAuthError(e));
    } finally { busy(false); }
  };

  gateEl = h('div', { class: 'auth-gate', role: 'dialog', 'aria-modal': 'true' }, form);
  document.body.append(gateEl);
  document.body.classList.add('locked');
  setTimeout(() => email.focus(), 60);
}
