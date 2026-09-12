import { supabase, supabaseEnabled } from './supabaseClient.js'

const TOKENS_KEY = 'mixxd_tokens'
const SESSIONS_KEY = 'mixxd_sessions'
const SESSION_ID_KEY = 'mixxd_session_id'
const CURRENT_TOKEN_KEY = 'mixxd_current_token'

const SESSION_TTL_MS = 2 * 60 * 60 * 1000
const SESSION_ACTIVE_MS = 120 * 1000

function generateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
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

function readSessions() {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || {}
  } catch {
    return {}
  }
}

function writeSessions(sessions) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

function cleanupSessions() {
  const sessions = readSessions()
  const now = Date.now()
  let changed = false
  for (const [token, session] of Object.entries(sessions)) {
    if (now - session.lastSeen > SESSION_TTL_MS) {
      delete sessions[token]
      changed = true
    }
  }
  if (changed) writeSessions(sessions)
  return sessions
}

export async function syncTokens() {
  if (!supabaseEnabled) return
  try {
    const { data, error } = await supabase
      .from('tokens')
      .select('token, mobile')
      .order('id', { ascending: false })
    if (error) throw error
    const tokens = (data || []).map(normalizeToken)
    writeTokens(tokens)
  } catch (err) {
    console.error('Supabase sync failed:', err)
  }
}

export function seedDefaultTokens() {
  const tokens = readTokens()
  if (tokens.length === 0) {
    writeTokens([{ token: 'mixxd2024', mobile: '' }])
  }
}

export function listTokens() {
  return readTokens()
}

export async function addToken(token, mobile) {
  const tokenTrim = String(token).trim()
  const mobileTrim = String(mobile).trim()
  if (!tokenTrim) return { ok: false, reason: 'empty' }
  const tokens = readTokens()
  if (tokens.some((t) => t.token === tokenTrim)) return { ok: false, reason: 'exists' }

  const newToken = { token: tokenTrim, mobile: mobileTrim }

  if (supabaseEnabled) {
    try {
      const { error } = await supabase.from('tokens').insert(newToken)
      if (error) throw error
    } catch (err) {
      console.error('Supabase add failed:', err)
      return { ok: false, reason: 'supabase' }
    }
  }

  tokens.unshift(newToken)
  writeTokens(tokens)
  return { ok: true }
}

export async function removeToken(token) {
  const tokenValue = typeof token === 'string' ? token : token?.token
  const tokens = readTokens().filter((t) => t.token !== tokenValue)
  writeTokens(tokens)
  const sessions = readSessions()
  if (sessions[tokenValue]) {
    delete sessions[tokenValue]
    writeSessions(sessions)
  }
  if (supabaseEnabled) {
    try {
      await supabase.from('tokens').delete().eq('token', tokenValue)
      await supabase.from('sessions').delete().eq('token', tokenValue)
    } catch (err) {
      console.error('Supabase remove failed:', err)
    }
  }
}

export async function login(token) {
  cleanupSessions()
  const trimmed = String(token).trim()
  const tokens = readTokens()
  if (!tokens.some((t) => t.token === trimmed)) return { ok: false, reason: 'invalid' }

  const sessionId = generateSessionId()

  if (supabaseEnabled) {
    try {
      const now = Date.now()
      const { data, error } = await supabase
        .from('sessions')
        .select('session_id, last_seen')
        .eq('token', trimmed)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      if (data && now - Number(data.last_seen) < SESSION_ACTIVE_MS) {
        return { ok: false, reason: 'in-use' }
      }
      const { error: upsertError } = await supabase
        .from('sessions')
        .upsert({ token: trimmed, session_id: sessionId, last_seen: now }, { onConflict: 'token' })
      if (upsertError) throw upsertError
      const sessions = readSessions()
      sessions[trimmed] = { sessionId, lastSeen: now }
      writeSessions(sessions)
    } catch (err) {
      console.error('Supabase login failed:', err)
      return { ok: false, reason: 'supabase' }
    }
  } else {
    const sessions = readSessions()
    const existing = sessions[trimmed]
    const currentSessionId = localStorage.getItem(SESSION_ID_KEY)
    const now = Date.now()
    if (existing && existing.sessionId !== currentSessionId && now - existing.lastSeen < SESSION_ACTIVE_MS) {
      return { ok: false, reason: 'in-use' }
    }
    sessions[trimmed] = { sessionId, lastSeen: now }
    writeSessions(sessions)
  }

  localStorage.setItem(SESSION_ID_KEY, sessionId)
  localStorage.setItem(CURRENT_TOKEN_KEY, trimmed)
  notifyAuthChange()

  return { ok: true, sessionId }
}

export async function logout() {
  const token = localStorage.getItem(CURRENT_TOKEN_KEY)
  const sessionId = localStorage.getItem(SESSION_ID_KEY)
  if (token) {
    const sessions = readSessions()
    if (sessions[token]?.sessionId === sessionId) {
      delete sessions[token]
      writeSessions(sessions)
    }
    if (supabaseEnabled) {
      try {
        await supabase.from('sessions').delete().eq('token', token)
      } catch (err) {
        console.error('Supabase logout failed:', err)
      }
    }
  }
  localStorage.removeItem(SESSION_ID_KEY)
  localStorage.removeItem(CURRENT_TOKEN_KEY)
  notifyAuthChange()
}

export function getCurrentToken() {
  return localStorage.getItem(CURRENT_TOKEN_KEY)
}

export function isAuthenticated() {
  cleanupSessions()
  const token = localStorage.getItem(CURRENT_TOKEN_KEY)
  const sessionId = localStorage.getItem(SESSION_ID_KEY)
  if (!token || !sessionId) return false
  const sessions = readSessions()
  return sessions[token]?.sessionId === sessionId
}

export async function touchSession() {
  const token = localStorage.getItem(CURRENT_TOKEN_KEY)
  const sessionId = localStorage.getItem(SESSION_ID_KEY)
  if (!token || !sessionId) return

  if (supabaseEnabled) {
    try {
      const now = Date.now()
      const { data, error } = await supabase
        .from('sessions')
        .select('session_id, last_seen')
        .eq('token', token)
        .single()
      if (error) {
        if (error.code === 'PGRST116') {
          await logout()
          return
        }
        throw error
      }
      if (data && data.session_id === sessionId && now - Number(data.last_seen) < SESSION_TTL_MS) {
        await supabase.from('sessions').update({ last_seen: now }).eq('token', token)
        const sessions = readSessions()
        sessions[token] = { sessionId, lastSeen: now }
        writeSessions(sessions)
      } else {
        await logout()
      }
    } catch (err) {
      console.error('Supabase touchSession failed:', err)
    }
    return
  }

  const sessions = readSessions()
  if (sessions[token]?.sessionId === sessionId) {
    sessions[token].lastSeen = Date.now()
    writeSessions(sessions)
  }
}

export function subscribeToSessions(callback) {
  const handleStorage = (e) => {
    if (e.key === SESSIONS_KEY || e.key === TOKENS_KEY) {
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
