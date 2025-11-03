// app/(contents)/layout.tsx
'use client'

/**
 * 내부 콘텐츠 레이아웃
 * - Sidebar + LogoutHeader + 페이지 본문(children)
 *
 * 핵심 수정:
 * 1) 최상위 wrapper에서 min-h-screen 제거
 * 2) main에서 overflow-auto 제거 (→ overflow-visible)
 * 이렇게 해야 "이중 스크롤"과 "항상 강제 100vh 이상" 현상이 사라집니다.
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

  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [role, setRole] = useState<'admin' | 'user' | undefined>()

  useEffect(() => {
    let unsubUser: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u)

      if (!u) {
        // 로그아웃 상태
        setIsSubscribed(false)
        setRole(undefined)
        setLoading(false)
        if (unsubUser) {
          unsubUser()
          unsubUser = null
        }
        return
      }

      // 로그인 상태: users/{uid} 구독
      const userRef = doc(db, 'users', u.uid)

      if (unsubUser) {
        unsubUser()
        unsubUser = null
      }

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
          // 에러 fallback
          setRole('user')
          setIsSubscribed(false)
          setLoading(false)
        }
      )
    })

    return () => {
      unsubAuth()
      if (unsubUser) unsubUser()
    }
  }, [])

  const canSeeAll = role === 'admin' || isSubscribed
  const FREE_ALLOW = ['/convert'] // 비구독자 허용 경로

  // 라우팅 가드
  useEffect(() => {
    if (loading) return

    if (!signedIn) {
      // 비로그인: 루트로
      if (pathname !== '/') router.replace('/')
      return
    }

    if (!canSeeAll) {
      const allowed = FREE_ALLOW.some((p) => pathname.startsWith(p))
      if (!allowed) router.replace('/convert')
    }
  }, [loading, signedIn, canSeeAll, pathname, router])

  return (
    <div className="w-full flex text-inherit">
      {/* 사이드바 */}
      <Sidebar />

      {/* 우측 본문 영역 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 상단 헤더 (로그아웃 / 구독버튼 등) */}
        <LogoutHeader />

        {/* 본문 컨텐츠 */}
        <main className="flex-1 p-4 overflow-visible">
          {loading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              권한 확인 중…
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
