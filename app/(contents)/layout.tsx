'use client'

/**
 * 내부 콘텐츠 레이아웃
 * - 좌측 Sidebar 배경을 화면 하단(footer 라인)까지 자연스럽게 이어지도록
 * - 전역 스크롤 문제 재발 방지(고정 높이/overflow-auto 사용 금지)
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

  // 상태
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [role, setRole] = useState<'admin' | 'user' | undefined>()

  // 로그인/유저 문서 구독
  useEffect(() => {
    let unsubUser: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u)

      if (!u) {
        setIsSubscribed(false)
        setRole(undefined)
        setLoading(false)
        if (unsubUser) { unsubUser(); unsubUser = null }
        return
      }

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
          setRole('user'); setIsSubscribed(false); setLoading(false)
        }
      )
    })

    return () => { unsubAuth(); if (unsubUser) unsubUser() }
  }, [])

  const canSeeAll = role === 'admin' || isSubscribed
  const FREE_ALLOW = ['/convert'] // 비구독 허용 경로

  // 라우팅 가드
  useEffect(() => {
    if (loading) return
    if (!signedIn) { if (pathname !== '/') router.replace('/'); return }
    if (!canSeeAll) {
      const allowed = FREE_ALLOW.some((p) => pathname.startsWith(p))
      if (!allowed) router.replace('/convert')
    }
  }, [loading, signedIn, canSeeAll, pathname, router])

  return (
    // 최상위 래퍼: 좌측(사이드바 영역) + 우측(본문 영역)
    <div className="w-full flex text-inherit">
      {/* 좌측 사이드 영역 전용 래퍼
          - min-h-screen: 화면 높이만큼은 최소 세로 확장 → footer 라인까지 시각적으로 이어짐
          - bg / border-r: 배경·경계선은 래퍼가 담당 (Sidebar 내부 중복 bg/border 있으면 제거 권장) */}
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 border-r border-gray-700/50">
        <Sidebar />
      </div>

      {/* 우측 본문 영역: 상단 헤더 + main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <LogoutHeader />

        {/* 본문: 이중 스크롤 방지 위해 overflow-visible 유지 */}
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
