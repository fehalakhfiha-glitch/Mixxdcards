import { useState } from 'react'
import { listTokens, addToken, removeToken, seedDefaultTokens } from './auth'

const MASTER_PASSWORD = 'admin'
const TOKENS_PER_PAGE = 20

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
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const refresh = () => {
    setTokens(listTokens())
    setPage(1)
  }

  const checkPassword = (e) => {
    e.preventDefault()
    if (password === MASTER_PASSWORD) {
      setUnlocked(true)
      setError('')
      setPage(1)
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

  const handleSearch = (e) => {
    setSearch(e.target.value)
    setPage(1)
  }

  const filtered = tokens.filter(
    (t) =>
      t.token.toLowerCase().includes(search.toLowerCase()) ||
      t.mobile.includes(search)
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / TOKENS_PER_PAGE))
  const effectivePage = Math.min(page, totalPages)
  const start = (effectivePage - 1) * TOKENS_PER_PAGE
  const paginated = filtered.slice(start, start + TOKENS_PER_PAGE)

  const goPrev = () => setPage(Math.max(1, effectivePage - 1))
  const goNext = () => setPage(Math.min(totalPages, effectivePage + 1))

  const handleExport = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(tokens, null, 2))
      setError('تم نسخ الرموز. الصقها في ملف public/tokens.json وأعد النشر.')
    } catch {
      setError('تعذر النسخ. انسخ الرموز يدوياً من localStorage.')
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
            <input
              type="text"
              value={search}
              onChange={handleSearch}
              placeholder="بحث برمز أو جوال"
              className="token-search"
              dir="ltr"
            />
            <ul className="token-list">
              {paginated.length === 0 && (
                <li className="empty">
                  {tokens.length === 0 ? 'لا توجد رموز' : 'لا توجد نتائج مطابقة'}
                </li>
              )}
              {paginated.map((t) => (
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
            {filtered.length > TOKENS_PER_PAGE && (
              <div className="token-pagination">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={effectivePage <= 1}
                >
                  السابق
                </button>
                <span>
                  صفحة {effectivePage} من {totalPages}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={effectivePage >= totalPages}
                >
                  التالي
                </button>
              </div>
            )}
            <button type="button" className="link-btn" onClick={onBack}>
              رجوع للدخول
            </button>
            <button type="button" className="link-btn" onClick={handleExport}>
              نسخ الرموز للنشر
            </button>
          </>
        )}
      </div>
    </div>
  )
}
