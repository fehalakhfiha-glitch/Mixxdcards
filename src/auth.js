const TOKENS_KEY = 'mixxd_tokens'
const SESSIONS_KEY = 'mixxd_sessions'
const SESSION_ID_KEY = 'mixxd_session_id'
const CURRENT_TOKEN_KEY = 'mixxd_current_token'

const SESSION_TTL_MS = 2 * 60 * 60 * 1000

function generateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY)) || []
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

export function seedDefaultTokens() {
  const tokens = readTokens()
  if (tokens.length === 0) {
    writeTokens(['mixxd2024'])
  }
}

export function listTokens() {
  return readTokens()
}

export function addToken(token) {
  const tokens = readTokens()
  const trimmed = String(token).trim()
  if (!trimmed || tokens.includes(trimmed)) return false
  tokens.push(trimmed)
  writeTokens(tokens)
  return true
}

export function removeToken(token) {
  const tokens = readTokens().filter((t) => t !== token)
  writeTokens(tokens)
  const sessions = readSessions()
  if (sessions[token]) {
    delete sessions[token]
    writeSessions(sessions)
  }
}

export function login(token) {
  cleanupSessions()
  const trimmed = String(token).trim()
  const tokens = readTokens()
  if (!tokens.includes(trimmed)) return { ok: false, reason: 'invalid' }

  const sessions = readSessions()
  const existing = sessions[trimmed]
  const currentSessionId = sessionStorage.getItem(SESSION_ID_KEY)

  if (existing && existing.sessionId !== currentSessionId) {
    return { ok: false, reason: 'in-use' }
  }

  const sessionId = currentSessionId || generateSessionId()
  sessions[trimmed] = { sessionId, lastSeen: Date.now() }
  writeSessions(sessions)

  sessionStorage.setItem(SESSION_ID_KEY, sessionId)
  sessionStorage.setItem(CURRENT_TOKEN_KEY, trimmed)

  return { ok: true, sessionId }
}

export function logout() {
  const token = sessionStorage.getItem(CURRENT_TOKEN_KEY)
  const sessionId = sessionStorage.getItem(SESSION_ID_KEY)
  if (token) {
    const sessions = readSessions()
    if (sessions[token]?.sessionId === sessionId) {
      delete sessions[token]
      writeSessions(sessions)
    }
  }
  sessionStorage.removeItem(SESSION_ID_KEY)
  sessionStorage.removeItem(CURRENT_TOKEN_KEY)
}

export function getCurrentToken() {
  return sessionStorage.getItem(CURRENT_TOKEN_KEY)
}

export function isAuthenticated() {
  cleanupSessions()
  const token = sessionStorage.getItem(CURRENT_TOKEN_KEY)
  const sessionId = sessionStorage.getItem(SESSION_ID_KEY)
  if (!token || !sessionId) return false
  const sessions = readSessions()
  return sessions[token]?.sessionId === sessionId
}

export function touchSession() {
  const token = sessionStorage.getItem(CURRENT_TOKEN_KEY)
  const sessionId = sessionStorage.getItem(SESSION_ID_KEY)
  if (!token || !sessionId) return
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
