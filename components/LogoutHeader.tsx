'use client'

// ✅ 디자인/마크업은 손대지 않습니다. 아래 로직만 추가/교체하세요.
import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase/firebase'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth'

export default function LogoutHeader() {
  const [init, setInit] = useState(true)     // 초기 로딩 중인지
  const [user, setUser] = useState<any>(null) // 로그인 사용자

  useEffect(() => {
    // 세션 유지(브라우저 재시작 후에도 로그인 유지)
    setPersistence(auth, browserLocalPersistence).catch(() => null)

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null)
      setInit(false)
    })
    return () => unsub()
  }, [])

  // ⛔ 초기 로딩 중엔 버튼 깜빡임/중복 노출 방지: 아무것도 안 그립니다.
  if (init) return null

  // ✅ 여기부터는 "기존 헤더 마크업"을 그대로 두고,
  //    로그인/로그아웃 버튼 부분만 조건으로 감싸세요.
  return (
    <header className="/* 기존 클래스 유지 */">
      {/* ... (기존 로고/메뉴/구독버튼 등 전부 그대로) ... */}

      {/* 🔻 로그인 안 된 상태에서만 '로그인' 버튼 보이게 */}
      {!user && (
        <button
          onClick={async () => {
            const provider = new GoogleAuthProvider()
            await signInWithPopup(auth, provider)
            // 필요하면 로그인 직후 라우팅: location.href = '/convert'
          }}
          className="/* 기존 버튼 클래스 그대로 */"
        >
          로그인
        </button>
      )}

      {/* 🔻 로그인 된 상태에서만 '로그아웃' 버튼 보이게 */}
      {user && (
        <button
          onClick={async () => {
            await signOut(auth)
            // 필요하면 로그아웃 직후 라우팅: location.href = '/'
          }}
          className="/* 기존 버튼 클래스 그대로 */"
        >
          로그아웃
        </button>
      )}
    </header>
  )
}
