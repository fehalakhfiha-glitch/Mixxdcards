import { supabase, supabaseEnabled } from './supabaseClient.js'

const TOKENS_KEY = 'mixxd_tokens'
const DEVICE_ID_KEY = 'mixxd_device_id'
const SESSION_COOKIE = 'mixxd_session'

const SESSION_MAX_AGE_S = 24 * 60 * 60
const SYNC_INTERVAL_MS = 60 * 1000

const LOCAL_ADMIN_PASSWORD = supabaseEnabled ? '' : import.meta.env.VITE_LOCAL_ADMIN_PASSWORD

if (supabaseEnabled) {
  localStorage.removeItem(TOKENS_KEY)
}
for (const key of ['mixxd_sessions', 'mixxd_session_id', 'mixxd_current_token']) {
  localStorage.removeItem(key)
}

let lastSession = null
let lastSyncAt = 0

function randomId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = randomId()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

function setSessionCookie(value, maxAge) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${SESSION_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
}

function readSession() {
  const raw = document.cookie.split('; ').find((c) => c.startsWith(`${SESSION_COOKIE}=`))
  if (!raw) return null
  try {
    const session = JSON.parse(decodeURIComponent(raw.slice(SESSION_COOKIE.length + 1)))
    if (!session?.token || !session?.sessionId) return null
    lastSession = session
    return session
  } catch {
    return null
  }
}

function writeSession(session) {
  setSessionCookie(encodeURIComponent(JSON.stringify(session)), SESSION_MAX_AGE_S)
  lastSession = session
  lastSyncAt = Date.now()
}

async function endServerSession(session) {
  if (!supabaseEnabled) return
  try {
    const { error } = await supabase.rpc('end_session', {
      p_token: session.token,
      p_session_id: session.sessionId,
    })
    if (error) throw error
  } catch (err) {
    console.error('Supabase end_session failed:', err)
  }
}

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
  const [result, sessions] = await Promise.all([
    adminRpc('admin_list_tokens', { p_password: password }),
    adminRpc('admin_list_sessions', { p_password: password }),
  ])
  if (!result.ok) return { ...result, tokens: [] }
  const active = new Set(sessions.ok && Array.isArray(sessions.data) ? sessions.data : [])
  const tokens = (Array.isArray(result.data) ? result.data : [])
    .map(normalizeToken)
    .map((t) => ({ ...t, active: active.has(t.token) }))
  return { ok: true, tokens }
}

export async function endCustomerSession(token, password) {
  if (!supabaseEnabled) return { ok: true }
  const result = await adminRpc('admin_end_session', { p_password: password, p_token: token })
  return result.ok ? { ok: true } : result
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

  let sessionId = randomId()
  if (supabaseEnabled) {
    try {
      const { data, error } = await supabase.rpc('start_session', {
        p_token: trimmed,
        p_device_id: getDeviceId(),
      })
      if (error) throw error
      if (data?.status === 'in-use') return { ok: false, reason: 'in-use' }
      if (data?.status !== 'ok') return { ok: false, reason: 'invalid' }
      sessionId = data.session_id
    } catch (err) {
      console.error('Supabase login failed:', err)
      return { ok: false, reason: 'supabase' }
    }
  } else if (!readTokens().some((t) => t.token === trimmed)) {
    return { ok: false, reason: 'invalid' }
  }

  const session = { token: trimmed, sessionId }
  writeSession(session)
  if (readSession()?.sessionId !== sessionId) {
    lastSession = null
    await endServerSession(session)
    return { ok: false, reason: 'cookies' }
  }
  notifyAuthChange()
  return { ok: true }
}

export async function logout() {
  const session = readSession() || lastSession
  lastSession = null
  if (!session) return
  setSessionCookie('', 0)
  notifyAuthChange()
  await endServerSession(session)
}

export function getCurrentToken() {
  return readSession()?.token ?? ''
}

export function isAuthenticated() {
  return !!readSession()
}

export async function touchSession(force = false) {
  const session = readSession()
  if (!session || (!force && Date.now() - lastSyncAt < SYNC_INTERVAL_MS)) return
  lastSyncAt = Date.now()

  let valid
  if (supabaseEnabled) {
    try {
      const { data, error } = await supabase.rpc('touch_session', {
        p_token: session.token,
        p_session_id: session.sessionId,
      })
      if (error) throw error
      valid = data === true
    } catch (err) {
      console.error('Supabase touchSession failed:', err)
      return
    }
  } else {
    valid = readTokens().some((t) => t.token === session.token)
  }

  if (readSession()?.sessionId !== session.sessionId) return
  if (valid) writeSession(session)
  else await logout()
}

export function subscribeToSessions(callback) {
  const handleStorage = (e) => {
    if (e.key === TOKENS_KEY || e.key === null) {
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
