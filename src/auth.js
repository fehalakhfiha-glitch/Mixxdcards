import { supabase, supabaseEnabled } from './supabaseClient.js'

const TOKENS_KEY = 'mixxd_tokens'
const SESSIONS_KEY = 'mixxd_sessions'
const SESSION_ID_KEY = 'mixxd_session_id'
const CURRENT_TOKEN_KEY = 'mixxd_current_token'

const LOCAL_ADMIN_PASSWORD = supabaseEnabled ? '' : import.meta.env.VITE_LOCAL_ADMIN_PASSWORD

if (supabaseEnabled) {
  localStorage.removeItem(TOKENS_KEY)
}
localStorage.removeItem(SESSIONS_KEY)
localStorage.removeItem(SESSION_ID_KEY)

export function normalizeTokenInput(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim()
}

function normalizeToken(t) {
  if (typeof t === 'string') return { token: t, mobile: '' }
  if (t && typeof t === 'object') {
    return { token: String(t.token || ''), mobile: String(t.mobile || '') }
  }
  return { token: '', mobile: '' }
}

function readTokens() {
  try {
    const raw = JSON.parse(localStorage.getItem(TOKENS_KEY))
    return Array.isArray(raw) ? raw.map(normalizeToken) : []
  } catch {
    return []
  }
}

function writeTokens(tokens) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

async function findToken(token) {
  const { data, error } = await supabase.rpc('check_token', { p_token: token })
  if (error) throw error
  return data === true
}

async function adminRpc(fn, args) {
  try {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) {
      if (error.code === '42501') return { ok: false, reason: 'unauthorized' }
      throw error
    }
    return { ok: true, data }
  } catch (err) {
    console.error(`Supabase ${fn} failed:`, err)
    return { ok: false, reason: 'supabase' }
  }
}

export async function verifyAdmin(password) {
  if (!supabaseEnabled) {
    const ok = !!LOCAL_ADMIN_PASSWORD && password === LOCAL_ADMIN_PASSWORD
    return ok ? { ok: true } : { ok: false, reason: 'unauthorized' }
  }
  const result = await adminRpc('admin_verify', { p_password: password })
  if (!result.ok) return result
  return result.data === true ? { ok: true } : { ok: false, reason: 'unauthorized' }
}

export async function fetchTokens(password) {
  if (!supabaseEnabled) return { ok: true, tokens: readTokens() }
  const result = await adminRpc('admin_list_tokens', { p_password: password })
  if (!result.ok) return { ...result, tokens: [] }
  return { ok: true, tokens: (Array.isArray(result.data) ? result.data : []).map(normalizeToken) }
}

export function seedDefaultTokens() {
  if (supabaseEnabled) return
  if (readTokens().length === 0) {
    writeTokens([{ token: 'mixxd2024', mobile: '' }])
  }
}

export async function addToken(token, mobile, password) {
  const tokenTrim = normalizeTokenInput(token)
  const mobileTrim = normalizeTokenInput(mobile)
  if (!tokenTrim) return { ok: false, reason: 'empty' }

  if (supabaseEnabled) {
    const result = await adminRpc('admin_add_token', {
      p_password: password,
      p_token: tokenTrim,
      p_mobile: mobileTrim,
    })
    if (!result.ok) return result
    return result.data === 'ok' ? { ok: true } : { ok: false, reason: result.data || 'supabase' }
  }

  const tokens = readTokens()
  if (tokens.some((t) => t.token === tokenTrim)) return { ok: false, reason: 'exists' }
  tokens.unshift({ token: tokenTrim, mobile: mobileTrim })
  writeTokens(tokens)
  return { ok: true }
}

export async function removeToken(token, password) {
  const tokenValue = typeof token === 'string' ? token : token?.token
  if (supabaseEnabled) {
    const result = await adminRpc('admin_remove_token', { p_password: password, p_token: tokenValue })
    return result.ok ? { ok: true } : result
  }
  writeTokens(readTokens().filter((t) => t.token !== tokenValue))
  return { ok: true }
}

export async function login(token) {
  const trimmed = normalizeTokenInput(token)
  if (!trimmed) return { ok: false, reason: 'invalid' }

  if (supabaseEnabled) {
    try {
      if (!(await findToken(trimmed))) return { ok: false, reason: 'invalid' }
    } catch (err) {
      console.error('Supabase login failed:', err)
      return { ok: false, reason: 'supabase' }
    }
  } else if (!readTokens().some((t) => t.token === trimmed)) {
    return { ok: false, reason: 'invalid' }
  }

  localStorage.setItem(CURRENT_TOKEN_KEY, trimmed)
  notifyAuthChange()
  return { ok: true }
}

export async function logout() {
  if (!localStorage.getItem(CURRENT_TOKEN_KEY)) return
  localStorage.removeItem(CURRENT_TOKEN_KEY)
  notifyAuthChange()
}

export function getCurrentToken() {
  return localStorage.getItem(CURRENT_TOKEN_KEY)
}

export function isAuthenticated() {
  return !!localStorage.getItem(CURRENT_TOKEN_KEY)
}

export async function touchSession() {
  const token = localStorage.getItem(CURRENT_TOKEN_KEY)
  if (!token) return

  if (supabaseEnabled) {
    try {
      if (!(await findToken(token))) await logout()
    } catch (err) {
      console.error('Supabase touchSession failed:', err)
    }
    return
  }

  if (!readTokens().some((t) => t.token === token)) await logout()
}

export function subscribeToSessions(callback) {
  const handleStorage = (e) => {
    if (e.key === CURRENT_TOKEN_KEY || e.key === TOKENS_KEY || e.key === null) {
      callback()
    }
  }
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mixxd_auth') : null
  const handleBroadcast = channel ? () => callback() : null

  window.addEventListener('storage', handleStorage)
  if (channel) channel.addEventListener('message', handleBroadcast)

  return () => {
    window.removeEventListener('storage', handleStorage)
    if (channel) {
      channel.removeEventListener('message', handleBroadcast)
      channel.close()
    }
  }
}

export function notifyAuthChange() {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('mixxd_auth')
    channel.postMessage('changed')
    setTimeout(() => channel.close(), 100)
  }
}
