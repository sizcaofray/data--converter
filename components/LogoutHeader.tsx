'use client'
/**
 * components/LogoutHeader.tsx (디자인 유지 + Firebase Auth 연동)
 * - 헤더는 항상 렌더(사라지는 일 없음)
 * - 로그인 상태에 따라: 이메일 표시, 로그인/로그아웃 버튼 단독 노출
 * - '구독' 버튼은 기존처럼 항상 표기(원하시면 조건부로 바꿀 수 있음)
 * - 버튼/레이아웃 클래스는 기존 파일 그대로 유지
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'

// ✅ Firebase Auth만 사용 (NextAuth 연동 금지)
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
  // 초기 로딩 중에도 헤더 자체는 보여주고, 버튼/이메일만 조건부로 바꿈
  const [init, setInit] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    // 세션 유지: 브라우저 재시작 후에도 로그인 유지
    setPersistence(auth, browserLocalPersistence).catch(() => null)

    // 로그인 상태 감시
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null)
      setInit(false)
    })
    return () => unsub()
  }, [])

  // 버튼 핸들러 (디자인은 그대로, 동작만 연결)
  const onLogin = async () => {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
    // 필요 시: 로그인 직후 이동 → location.href = '/convert'
  }

  const onLogout = async () => {
    await signOut(auth)
    // 필요 시: 로그아웃 직후 이동 → location.href = '/'
  }

  return (
    <header
      className="h-14 border-b border-white/10 flex items-center justify-between px-4 select-none"
      // 절대 헤더 전체 onClick으로 라우팅하지 말 것
    >
      {/* 좌측: 브랜드(기존 링크/클래스 유지) */}
      <div className="shrink-0">
        <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80">
          <span className="font-semibold">Data Converter</span>
        </Link>
      </div>

      {/* 가운데: (기존처럼 비워둠) */}
      <div className="flex-1 px-4" />

      {/* 우측: 구독/이메일/로그인/로그아웃 (디자인/클래스 유지) */}
      <div className="shrink-0 flex items-center gap-3">
        {/* 구독 버튼: 항상 노출 (원하면 조건부로 변경 가능) */}
        <button
          type="button"
          // onClick={() => setSubscribeOpen(true)}  // 기존 팝업 연결만 수행
          className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
        >
          구독
        </button>

        {/* 로그인되어 있으면 사용자 메일 표기 (init 동안은 깜빡임 방지용으로 숨김) */}
        {!init && user && (
          <span className="text-xs opacity-80">{user.email}</span>
        )}

        {/* 로그인/로그아웃은 단독 노출 */}
        {!init && !user && (
          <button
            type="button"
            onClick={onLogin}
            className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
          >
            로그인
          </button>
        )}
        {!init && user && (
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
