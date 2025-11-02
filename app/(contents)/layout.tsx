// app/(contents)/layout.tsx
'use client'

/**
 * 전역 콘텐츠 레이아웃
 * - Sidebar(좌측), LogoutHeader(우측 상단), 실제 페이지 내용(children)을 감싸는 레이아웃입니다.
 *
 * 이번 수정의 핵심:
 * ---------------------------------------------------------
 * 기존에는 <main className="flex-1 overflow-auto p-4"> 로 되어 있었습니다.
 *
 * 문제:
 *  - overflow-auto 때문에 main 영역이 "고정 높이(화면 높이 - 헤더 높이)" 상자로 동작했습니다.
 *  - 그래서 어떤 페이지든 항상 main 내부에서만 별도 스크롤이 생겼습니다.
 *  - 화면에 여유 공간이 있어도 내부 스크롤바가 먼저 생겨서 이중 스크롤/답답한 스크롤 구조가 발생했습니다.
 *
 * 해결:
 *  - overflow-auto 를 제거하고, main을 일반 흐름으로 둡니다.
 *  - 즉, 페이지 내용이 길면 body 전체가 자연스럽게 스크롤되도록 변경합니다.
 *  - 내용이 짧으면 스크롤 자체가 나타나지 않습니다.
 *
 * 주의:
 *  - LogoutHeader(상단 바)는 이제 고정(sticky)로 붙지 않고, 페이지를 스크롤하면 같이 올라갑니다.
 *    => 현재 요구사항의 우선순위는 "강제 고정 높이 제거"이므로, 먼저 이것을 반영합니다.
 *    => 추후 원하시면 LogoutHeader를 sticky로 고정하는 것도 가능합니다(별도 요청 시 전체 코드로 드리겠습니다).
 */

import React, { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import LogoutHeader from '@/components/LogoutHeader'
import { usePathname, useRouter } from 'next/navigation'

import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

export default function ContentsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  // ─────────────────────────────────────
  // 로그인 / 권한 상태
  // ─────────────────────────────────────
  const [loading, setLoading] = useState(true)             // 권한 체크 중인지 여부
  const [signedIn, setSignedIn] = useState(false)          // 로그인 여부
  const [isSubscribed, setIsSubscribed] = useState(false)  // 유료 구독 여부 (true면 유료)
  const [role, setRole] = useState<'admin' | 'user' | undefined>() // Firestore users/{uid}.role

  // 로그인 & Firestore 사용자 문서 실시간 구독
  useEffect(() => {
    let unsubUser: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u)

      if (!u) {
        // 로그아웃 상태
        setIsSubscribed(false)
        setRole(undefined)
        setLoading(false)
        if (unsubUser) { unsubUser(); unsubUser = null }
        return
      }

      // 로그인 상태: users/{uid} 문서 실시간 감시
      const userRef = doc(db, 'users', u.uid)
      if (unsubUser) { unsubUser(); unsubUser = null }
      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          const data = snap.exists() ? (snap.data() as any) : {}
          const roleNorm = String(data.role ?? 'user').toLowerCase()
          setRole(roleNorm === 'admin' ? 'admin' : 'user')
          setIsSubscribed(Boolean(data.isSubscribed))
          setLoading(false)
        },
        () => {
          // 에러 시 기본값
          setRole('user'); setIsSubscribed(false); setLoading(false)
        }
      )
    })

    return () => { unsubAuth(); if (unsubUser) unsubUser() }
  }, [])

  // 구독권/관리자 권한으로 접근 가능한지
  const canSeeAll = role === 'admin' || isSubscribed

  // 무료 사용자도 접근 허용되는 경로들
  const FREE_ALLOW = ['/convert']

  // 라우팅 가드:
  // - 로그인 안 했으면 '/' 로 돌립니다.
  // - 구독/권한 없으면 FREE_ALLOW 안에 있는 페이지만 접근 허용합니다.
  useEffect(() => {
    if (loading) return
    if (!signedIn) { 
      if (pathname !== '/') router.replace('/') 
      return 
    }
    if (!canSeeAll) {
      const allowed = FREE_ALLOW.some((p) => pathname.startsWith(p))
      if (!allowed) router.replace('/convert')
    }
  }, [loading, signedIn, canSeeAll, pathname, router])

  return (
    // min-h-screen: 최소한 화면 전체 높이만큼은 차지
    // flex: 좌측 Sidebar + 우측 본문 영역 나란히
    // text-inherit: 전역 다크/라이트 색상 그대로 상속
    <div className="min-h-screen w-full flex text-inherit">
      {/* 좌측 사이드바 (admin/구독 상태에 따라 메뉴 제어) */}
      <Sidebar />

      {/* 우측 본문 래퍼: 세로 방향 레이아웃 (상단 LogoutHeader → 아래 실제 페이지 내용) */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 상단 헤더(로그인/구독/로그아웃 버튼 등) */}
        <LogoutHeader />

        {/*
          main 영역에서 overflow-auto(고정 높이 스크롤 상자)를 제거했습니다.
          - flex-1 은 유지해서 가로폭/배치를 안정적으로 채웁니다.
          - overflow를 강제로 주지 않으므로,
            컨텐츠가 길면 문서(body) 전체가 자연스럽게 스크롤됩니다.
          - 컨텐츠가 짧으면 스크롤이 생기지 않습니다.
        */}
        <main className="flex-1 p-4 overflow-visible">
          {loading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">권한 확인 중…</div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
