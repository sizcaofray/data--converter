'use client'
/**
 * LogoutHeader.tsx
 * - 디자인/마크업은 기존 그대로 유지
 * - 로그인 버튼: 로그인 안 된 경우에만 보이도록 {!user}
 * - 로그아웃 버튼: 로그인 된 경우에만 보이도록 {user}
 * - 버튼 onClick 핸들러만 Firebase Auth 로직으로 연결
 */

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
  const [init, setInit] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => null)
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null)
      setInit(false)
    })
    return () => unsub()
  }, [])

  // ✅ 핸들러만 정의하고, 기존 버튼 onClick에 연결
  const onLogin = async () => {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  const onLogout = async () => {
    await signOut(auth)
  }

  // 로딩 시 깜빡임 방지
  if (init) return null

  return (
    // ⬇⬇⬇⬇⬇⬇⬇⬇⬇⬇  !!! 여기 “안쪽”은 기존의 헤더 마크업을 그대로 두세요 !!!  ⬇⬇⬇⬇⬇⬇⬇⬇⬇⬇
    <header className="/* 기존 클래스 그대로 */">
      {/* ... 로고/네비/구독 버튼 등 기존 요소 그대로 ... */}

      {/* 🔻 기존 '로그인' 버튼 조각을 이 블록 안으로 옮겨 주세요 (클래스/스타일 그대로) */}
      {!user && (
        <button onClick={onLogin} className="/* 기존 로그인 버튼 클래스 그대로 */">
          로그인
        </button>
      )}

      {/* 🔻 기존 '로그아웃' 버튼 조각을 이 블록 안으로 옮겨 주세요 (클래스/스타일 그대로) */}
      {user && (
        <button onClick={onLogout} className="/* 기존 로그아웃 버튼 클래스 그대로 */">
          로그아웃
        </button>
      )}
    </header>
    // ⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆  디자인/클래스 변경 금지. 텍스트만 조건으로 감싸는 방식  ⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆
  )
}
