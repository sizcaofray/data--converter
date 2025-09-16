'use client'
/**
 * components/LogoutHeader.tsx
 * - 기존 디자인/흐름 유지
 * - 구독 버튼 → SubscribePopupContext.open() 연결
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase/firebase'
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth'

// ✅ 추가: 구독 팝업 컨텍스트 사용
import { useSubscribePopup } from '@/contexts/SubscribePopupContext'

export default function LogoutHeader() {
  const router = useRouter()
  const [init, setInit] = useState(true)
  const [user, setUser] = useState<any>(null)

  // ✅ 팝업 열기 함수
  const { open } = useSubscribePopup()

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => null)
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null)
      setInit(false)
    })
    return () => unsub()
  }, [])

  const onLogin = async () => {
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (e: any) {
      if (e?.code === 'auth/popup-closed-by-user') return
      console.warn('[auth] signIn error:', e?.code || e)
    }
  }

  const onLogout = async () => {
    try {
      await signOut(auth)
    } finally {
      router.replace('/')
    }
  }

  // 초기 로딩 중: 버튼 비활성(깜빡임 방지)
  if (init) {
    return (
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 select-none">
        <div className="shrink-0">
          <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80">
            <span className="font-semibold">Data Converter</span>
          </Link>
        </div>
        <div className="flex-1 px-4" />
        <div className="shrink-0 flex items-center gap-3">
          <button
            type="button"
            className="text-sm rounded px-3 py-1 border border-white/20 opacity-60"
            disabled
          >
            구독
          </button>
        </div>
      </header>
    )
  }

  return (
    <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 select-none">
      <div className="shrink-0">
        <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80">
          <span className="font-semibold">Data Converter</span>
        </Link>
      </div>
      <div className="flex-1 px-4" />
      <div className="shrink-0 flex items-center gap-3">
        {/* ✅ 구독 버튼 → 팝업 open 연결 */}
        <button
          type="button"
          onClick={open}
          className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
        >
          구독
        </button>

        {user && <span className="text-xs opacity-80">{user.email}</span>}

        {!user ? (
          <button type="button" onClick={onLogin} className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20">
            로그인
          </button>
        ) : (
          <button type="button" onClick={onLogout} className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20">
            로그아웃
          </button>
        )}
      </div>
    </header>
  )
}
