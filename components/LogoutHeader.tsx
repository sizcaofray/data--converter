'use client'
/**
 * components/LogoutHeader.tsx
 *
 * 기능 요약
 *  - 헤더는 항상 렌더(사라지지 않음)
 *  - 로그인 상태에 따라: 이메일 표시, 로그인/로그아웃 버튼 '중 하나만' 노출
 *  - '구독' 버튼은 기존 디자인대로 유지(원하면 조건부 노출로 바꿀 수 있음)
 *  - 로그아웃 클릭 시 '/'(app/page.tsx)로 이동
 *  - 디자인/클래스/레이아웃은 그대로, 이벤트 로직만 연결
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

type Props = {}

export default function LogoutHeader(props: Props) {
  const router = useRouter()

  const [init, setInit] = useState(true)     // 초기 로딩(깜빡임 방지용)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    // 브라우저 재시작 후에도 로그인 유지
    setPersistence(auth, browserLocalPersistence).catch(() => null)

    // 로그인 상태 실시간 감시
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null)
      setInit(false)
    })
    return () => unsub()
  }, [])

  // 버튼 핸들러: 디자인은 그대로, 동작만 연결
  const onLogin = async () => {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
    // (선택) 로그인 직후 특정 페이지로 보낼 때 사용
    // router.replace('/convert')
  }

  const onLogout = async () => {
    await signOut(auth)
    router.replace('/') // ✅ 로그아웃 후 메인으로 이동
  }

  // 초기 로딩 동안 버튼 중복 노출 방지(헤더 자체는 렌더)
  // init 동안에도 헤더는 보여야 한다면, 아래 return null을 제거하고
  // 버튼 조건부에서 'init' 조건을 추가로 거시면 됩니다.
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
            className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
            disabled
          >
            구독
          </button>
          {/* init 동안에는 로그인/로그아웃/이메일을 보여주지 않음(깜빡임 방지) */}
        </div>
      </header>
    )
  }

  return (
    <header
      className="h-14 border-b border-white/10 flex items-center justify-between px-4 select-none"
    >
      {/* 좌측: 브랜드 */}
      <div className="shrink-0">
        <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80">
          <span className="font-semibold">Data Converter</span>
        </Link>
      </div>

      {/* 가운데: 여백 */}
      <div className="flex-1 px-4" />

      {/* 우측: 구독/이메일/로그인/로그아웃(디자인 그대로) */}
      <div className="shrink-0 flex items-center gap-3">
        {/* 구독 버튼: 항상 노출(필요 시 조건부로 전환 가능) */}
        <button
          type="button"
          className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
        >
          구독
        </button>

        {/* 로그인되어 있으면 이메일 표시 */}
        {user && <span className="text-xs opacity-80">{user.email}</span>}

        {/* 로그인/로그아웃은 단독 노출 */}
        {!user && (
          <button
            type="button"
            onClick={onLogin}
            className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
          >
            로그인
          </button>
        )}
        {user && (
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
