'use client'
/**
 * components/LogoutHeader.tsx
 * - 디자인/마크업 유지
 * - 로그인 팝업을 사용자가 닫은 오류(auth/popup-closed-by-user)는 조용히 무시
 * - 로그아웃 후 '/' 이동
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

export default function LogoutHeader() {
  const router = useRouter()
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

  const onLogin = async () => {
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      // 필요 시: router.replace('/convert')
    } catch (e: any) {
      // 사용자가 팝업을 닫은 경우는 조용히 무시
      if (e?.code === 'auth/popup-closed-by-user') return
      // 그 외 오류만 콘솔 경고
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

  // 초기 로딩 중에도 헤더는 렌더(버튼 깜빡임만 방지)
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
        <button
          type="button"
          className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
        >
          구독
        </button>
        {user && <span className="text-xs opacity-80">{user.email}</span>}
        {!user ? (
          <button
            type="button"
            onClick={onLogin}
            className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
          >
            로그인
          </button>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
          >
            로그아웃
          </button>
        )}
      </div>
    </header>
  )
}
