import { useState } from 'react'
import { listTokens, addToken, removeToken, seedDefaultTokens } from './auth'

const MASTER_PASSWORD = 'admin'

export default function TokenManager({ onBack }) {
  const [tokens, setTokens] = useState(() => {
    seedDefaultTokens()
    return listTokens()
  })
  const [newToken, setNewToken] = useState('')
  const [newMobile, setNewMobile] = useState('')
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => setTokens(listTokens())

  const checkPassword = (e) => {
    e.preventDefault()
    if (password === MASTER_PASSWORD) {
      setUnlocked(true)
      setError('')
      refresh()
    } else {
      setError('كلمة المرور الرئيسية غير صحيحة.')
    }
  }

  const handleAdd = (e) => {
    e.preventDefault()
    const tokenTrim = newToken.trim()
    const mobileTrim = newMobile.trim()
    if (!tokenTrim) return
    if (!mobileTrim) {
      setError('أدخل رقم الجوال لصاحب الرمز.')
      return
    }
    if (addToken(tokenTrim, mobileTrim)) {
      setNewToken('')
      setNewMobile('')
      setError('')
      refresh()
    } else {
      setError('الرمز فارغ أو موجود مسبقاً.')
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>إدارة الرموز</h1>
        {!unlocked ? (
          <form onSubmit={checkPassword}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور الرئيسية"
              autoFocus
            />
            <button type="submit">فتح</button>
            {error && <div className="auth-error">{error}</div>}
            <button type="button" className="link-btn" onClick={onBack}>
              رجوع للدخول
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleAdd} className="token-add-form">
              <input
                type="text"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                placeholder="رمز جديد"
                dir="ltr"
              />
              <input
                type="tel"
                value={newMobile}
                onChange={(e) => setNewMobile(e.target.value)}
                placeholder="رقم الجوال"
                dir="ltr"
              />
              <button type="submit">إضافة</button>
            </form>
            {error && <div className="auth-error">{error}</div>}
            <ul className="token-list">
              {tokens.length === 0 && <li className="empty">لا توجد رموز</li>}
              {tokens.map((t) => (
                <li key={t.token}>
                  <div className="token-info">
                    <span className="token-value">{t.token}</span>
                    <span className="token-mobile">{t.mobile || '—'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      removeToken(t.token)
                      refresh()
                    }}
                  >
                    حذف
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="link-btn" onClick={onBack}>
              رجوع للدخول
            </button>
          </>
        )}
      </div>
    </div>
  )
}
