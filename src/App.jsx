import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import Login from './Login.jsx'
import TokenManager from './TokenManager.jsx'
import {
  syncTokens,
  seedDefaultTokens,
  listTokens,
  isAuthenticated,
  logout,
  getCurrentToken,
  touchSession,
  subscribeToSessions,
} from './auth.js'

const TOTAL_CONVERSATIONS = 100
const TRIAL_URL =
  'https://mixxd.net/%D8%A8%D8%B7%D8%A7%D9%82%D8%A7%D8%AA-%D8%AA%D8%B9%D9%84%D9%8A%D9%85-%D8%A7%D9%84%D9%84%D8%BA%D8%A9-%D8%A7%D9%84%D8%A7%D9%86%D8%AC%D9%84%D9%8A%D8%B2%D9%8A%D8%A9-%D8%B1%D9%82%D9%85%D9%8A%D8%A9-100-%D9%85%D8%AD%D8%A7%D8%AF%D8%AB%D8%A9-%D8%A3%D8%B3%D8%A7%D8%B3%D9%8A%D8%A9/p116418509'

function AuthMenu({ label, actionLabel, onAction }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="auth-menu" ref={menuRef}>
      <button
        type="button"
        className="auth-menu-btn"
        aria-label="القائمة"
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <div className="auth-dropdown">
          <span className="auth-token">{label}</span>
          <button type="button" className="auth-logout" onClick={onAction}>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  )
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 187 191" xmlns="http://www.w3.org/2000/svg">
      <g transform="matrix(1,0,0,1,-631.821968,-32.640977)">
        <g transform="matrix(1.692241,0,0,1.692241,546.720503,-327.306332)">
          <path
            fill="#E4E7EC"
            d="M118.549,216.408C121.285,218.089 123.329,219.17 127.163,224.723C131.766,231.388 132.221,241.025 132.291,242.503C132.644,249.978 129.928,271.717 124.838,276.841C124.357,277.325 124.319,277.364 119.398,283.417C118.392,284.654 115.18,287.369 119.453,293.535C124.043,300.157 138.599,300.85 145.577,303.294C150.626,305.062 152.399,305.8 155.191,309.694C155.701,310.407 160.549,320.878 160.506,322.5C160.483,323.352 160.431,323.353 159.831,323.957C159.246,324.547 159.114,324.27 152.498,324.449C147.575,324.582 147.592,324.845 140.503,324.822C134.974,324.804 134.993,325.176 129.481,324.947C127.23,324.853 127.245,325.114 124.496,324.901C123.859,324.851 123.864,324.938 116.511,324.971C113.496,324.984 113.511,325.09 110.487,324.915C109.918,324.882 81.601,324.748 79.504,324.822C74.492,325 74.502,324.839 69.498,325.05C66.009,325.197 66.023,324.86 62.524,324.961C60.749,325.012 51.335,324.157 50.634,323.413C48.896,321.569 53.968,309.424 60.424,305.376C66.191,301.759 69.649,301.926 80.555,298.727C82.362,298.197 84.556,298.046 88.536,295.549C90.609,294.249 92.752,290.839 92.847,289.512C93.16,285.137 86.575,280.044 83.382,273.566C81.125,268.987 80.946,268.753 79.384,264.491C79.288,264.231 79.188,263.956 79.081,263.664C78.998,263.436 77.403,243.002 78.431,236.492C79.707,228.41 85.186,220.776 89.687,217.78C90.667,217.127 95.005,214.24 103.545,212.817C107.08,212.228 113.658,214.032 118.549,216.408Z"
          />
        </g>
      </g>
    </svg>
  )
}

function App() {
  const [authView, setAuthView] = useState('login')
  const [isLoggedIn, setIsLoggedIn] = useState(() => isAuthenticated())
  const [isTrial, setIsTrial] = useState(false)
  const [view, setView] = useState('list')
  const [currentConversation, setCurrentConversation] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [jumpInput, setJumpInput] = useState('')
  const [jumpError, setJumpError] = useState('')
  const [currentTrack, setCurrentTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const playerRef = useRef(new Audio())

  const stopPlayback = useCallback(() => {
    const player = playerRef.current
    player.pause()
    player.currentTime = 0
    setIsPlaying(false)
    setCurrentTrack(null)
  }, [])

  const checkAuth = useCallback(() => {
    if (isTrial) return
    if (isAuthenticated()) {
      setIsLoggedIn(true)
      setAuthView('login')
    } else {
      logout()
      setIsLoggedIn(false)
      setView('list')
      stopPlayback()
      setData(null)
    }
  }, [stopPlayback, isTrial])

  const handleLogin = useCallback(() => {
    setIsLoggedIn(true)
    setView('list')
    setAuthView('login')
  }, [])

  const handleLogout = useCallback(() => {
    logout()
    setIsLoggedIn(false)
    setView('list')
    setData(null)
    stopPlayback()
  }, [stopPlayback])

  const handleTrial = useCallback(() => {
    setIsTrial(true)
    setView('list')
    setJumpInput('')
    setJumpError('')
    window.scrollTo(0, 0)
  }, [])

  const handleTrialBack = useCallback(() => {
    setIsTrial(false)
    setView('list')
    setJumpInput('')
    setJumpError('')
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    syncTokens().finally(() => {
      if (listTokens().length === 0) seedDefaultTokens()
    })
  }, [])

  useEffect(() => {
    return subscribeToSessions(() => {
      checkAuth()
    })
  }, [checkAuth])

  useEffect(() => {
    if (!isLoggedIn) return
    const run = () => {
      touchSession().then(() => {
        if (!isAuthenticated()) {
          handleLogout()
        }
      })
    }
    run()
    const interval = setInterval(run, 30000)
    return () => clearInterval(interval)
  }, [isLoggedIn, handleLogout])

  const playAudio = useCallback(
    (fileName, trackId) => {
      if (currentTrack === trackId) {
        stopPlayback()
        return
      }
      stopPlayback()
      const player = playerRef.current
      const src = `conversations/Conversation_${currentConversation}/${fileName}`
      setCurrentTrack(trackId)
      setIsPlaying(true)
      player.src = src
      player.play().catch((err) => {
        console.error(err)
        stopPlayback()
      })
    },
    [currentTrack, currentConversation, stopPlayback]
  )

  const openConversation = useCallback(
    async (id) => {
      id = parseInt(id, 10)
      if (!id || id < 1 || id > TOTAL_CONVERSATIONS) return
      stopPlayback()
      setCurrentConversation(id)
      setView('conversation')
      setData(null)
      setError('')
      window.scrollTo(0, 0)
      try {
        const response = await fetch(`conversations/Conversation_${id}/data.json`)
        if (!response.ok) throw new Error('File not found')
        const json = await response.json()
        setData(json)
      } catch {
        setError('❌ تعذر تحميل ملف data.json لهذه المحادثة.')
      }
    },
    [stopPlayback]
  )

  const handleLessonSelect = useCallback(
    (id) => {
      id = parseInt(id, 10)
      if (!id || id < 1 || id > TOTAL_CONVERSATIONS) return
      if (isTrial) {
        if (id > 2) {
          window.open(TRIAL_URL, '_blank')
          return
        }
        openConversation(id)
        return
      }
      openConversation(id)
    },
    [isTrial, openConversation]
  )

  const previousConversation = useCallback(() => {
    if (currentConversation > 1) handleLessonSelect(currentConversation - 1)
  }, [currentConversation, handleLessonSelect])

  const nextConversation = useCallback(() => {
    if (currentConversation < TOTAL_CONVERSATIONS) handleLessonSelect(currentConversation + 1)
  }, [currentConversation, handleLessonSelect])

  const showList = useCallback(() => {
    stopPlayback()
    setView('list')
    setJumpInput('')
    setJumpError('')
    window.scrollTo(0, 0)
  }, [stopPlayback])

  const goToCard = () => {
    const val = parseInt(jumpInput, 10)
    if (!val || val < 1 || val > TOTAL_CONVERSATIONS) {
      setJumpError(`من فضلك اكتب رقم صحيح من 1 إلى ${TOTAL_CONVERSATIONS}`)
      return
    }
    setJumpError('')
    if (isTrial) {
      handleLessonSelect(val)
      return
    }
    openConversation(val)
  }

  useEffect(() => {
    const player = playerRef.current

    const handleEnded = () => {
      player.currentTime = 0
      player.play()
    }

    const handleError = () => {
      alert('تعذر تشغيل الملف الصوتي. تأكد من وجود الملف في المسار المحدد.')
      stopPlayback()
    }

    player.addEventListener('ended', handleEnded)
    player.addEventListener('error', handleError)

    return () => {
      player.pause()
      player.removeEventListener('ended', handleEnded)
      player.removeEventListener('error', handleError)
    }
  }, [stopPlayback])

  useEffect(() => {
    if (view !== 'conversation') return
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') previousConversation()
      if (e.key === 'ArrowLeft') nextConversation()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [view, previousConversation, nextConversation])

  if (!isLoggedIn && !isTrial && authView === 'tokens') {
    return <TokenManager onBack={() => setAuthView('login')} />
  }

  if (!isLoggedIn && !isTrial) {
    return (
      <Login
        onLogin={handleLogin}
        onManageTokens={() => setAuthView('tokens')}
        onTrial={handleTrial}
      />
    )
  }

  return (
    <>
      {view === 'list' && (
        <div id="conversationList">
          <div className="auth-bar">
            {isTrial ? (
              <AuthMenu
                label="تجربة"
                actionLabel="خروج من التجربة"
                onAction={handleTrialBack}
              />
            ) : (
              <AuthMenu
                label={`الرمز: ${getCurrentToken()}`}
                actionLabel="خروج"
                onAction={handleLogout}
              />
            )}
          </div>
          <h1>اختر المحادثة</h1>
          <div className="search-bar">
            <input
              id="quickJumpInput"
              type="number"
              min="1"
              max={TOTAL_CONVERSATIONS}
              placeholder={`اكتب رقم البطاقة (1-${TOTAL_CONVERSATIONS})`}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') goToCard()
              }}
            />
            <button id="quickJumpBtn" type="button" onClick={goToCard}>
              اذهب
            </button>
          </div>
          <div id="quickJumpError" className={jumpError ? 'visible' : ''}>
            {jumpError}
          </div>
          <div className="card-grid" id="cardGrid">
            {Array.from({ length: TOTAL_CONVERSATIONS }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className="card-btn"
                onClick={() => handleLessonSelect(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'conversation' && (
        <div id="conversationSection" className="visible">
          <div className="auth-bar">
            {isTrial ? (
              <AuthMenu
                label="تجربة"
                actionLabel="خروج من التجربة"
                onAction={handleTrialBack}
              />
            ) : (
              <AuthMenu
                label={`الرمز: ${getCurrentToken()}`}
                actionLabel="خروج"
                onAction={handleLogout}
              />
            )}
          </div>
          <div className="card-container">
            <div className="badge-number" id="convBadge">
              {currentConversation}
            </div>
            <div className="title-box">
              <h2 id="convTitle">
                {data ? data.title : error ? '' : 'جاري التحميل...'}
              </h2>
            </div>
            <div id="chatContent">
              {!data && !error && (
                <div className="loading">⏳ جاري جلب المحادثة...</div>
              )}
              {error && <div className="loading error">{error}</div>}
              {data &&
                data.dialogue.map((line, index) => {
                  const trackId = `part-${index}`
                  const isCurrent = currentTrack === trackId && isPlaying
                  return (
                    <div key={index} className={`chat-row speaker-${line.speaker}`}>
                      <div className="avatar-wrap">
                        <div className="avatar">
                          <PersonIcon />
                        </div>
                        <div className="speaker-label">{line.speaker}</div>
                      </div>
                      <div className="bubble">
                        <div className="text-en">{line.en}</div>
                        <div className="text-ar">{line.ar}</div>
                      </div>
                      <button
                        className={`btn-audio ${isCurrent ? 'active' : ''}`}
                        onClick={() => playAudio(`part_${index + 1}.mp3`, trackId)}
                      >
                        {isCurrent ? '⏹️' : '▶'}
                      </button>
                    </div>
                  )
                })}
            </div>
            {data && (
              <div
                className="footer-bar"
                id="fullAudioBtn"
                onClick={() => playAudio('Full_Audio.mp3', 'full')}
              >
                <span id="fullAudioBtnText">
                  {currentTrack === 'full' && isPlaying
                    ? '⏹️ إيقاف'
                    : 'تشغيل المحادثة كاملة (الإنجليزية)'}
                </span>
              </div>
            )}
          </div>

          <div className="bottom-nav-bar">
            <button
              id="prevBtn"
              className="nav-arrow-btn btn-prev"
              type="button"
              title="المحادثة السابقة"
              onClick={previousConversation}
              disabled={currentConversation <= 1}
            >
              <svg
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
                width="22"
                height="22"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
            <button
              className="btn-list-home"
              type="button"
              title="الرجوع للقائمة"
              onClick={showList}
            >
              <svg
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
                width="24"
                height="24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
            <button
              id="nextBtn"
              className="nav-arrow-btn btn-next"
              type="button"
              title="المحادثة التالية"
              onClick={nextConversation}
              disabled={currentConversation >= TOTAL_CONVERSATIONS}
            >
              <svg
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
                width="22"
                height="22"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default App
