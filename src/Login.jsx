import { useState } from 'react'
import { login } from './auth'

export default function Login({ onLogin, onManageTokens, onTrial }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(token)
      if (result.ok) {
        onLogin()
      } else if (result.reason === 'in-use') {
        setError('الرمز مستخدم حالياً في جهاز أو نافذة أخرى.')
      } else if (result.reason === 'supabase') {
        setError('تعذر الاتصال بقاعدة البيانات.')
      } else {
        setError('رمز الوصول غير صالح.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>تسجيل الدخول</h1>
        <p className="auth-hint">أدخل رمز الوصول للدخول إلى المحتوى</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="رمز الوصول"
            autoFocus
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                جاري الدخول...
              </>
            ) : (
              'دخول'
            )}
          </button>
        </form>
        {error && <div className="auth-error">{error}</div>}
        <button type="button" className="link-btn" onClick={onManageTokens}>
          إدارة الرموز
        </button>
        <button type="button" className="link-btn trial-btn" onClick={onTrial}>
          تجربة
        </button>
      </div>
    </div>
  )
}
