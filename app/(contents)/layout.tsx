'use client'
/**
 * app/(contents)/layout.tsx
 *
 * 기능 요약
 *  - 비로그인 사용자는 (contents) 영역 접근 시 항상 '/'(app/page.tsx)로 이동
 *  - 로그인 + (role==='admin' 또는 isSubscribed===true) ⇒ 전체 페이지 접근 허용
 *  - 로그인 + (일반 비구독자) ⇒ '/convert' 페이지만 허용
 *  - Firestore users/{uid} 문서를 onSnapshot으로 실시간 구독해 권한 변경 즉시 UI 반영
 *  - 디자인은 Sidebar/LogoutHeader를 그대로 사용 (마크업/스타일 변경 없음)
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

  // ✅ 상태: 로딩/로그인/권한
  const [loading, setLoading] = useState(true)                         // 권한 정보 로딩 여부
  const [signedIn, setSignedIn] = useState(false)                      // 로그인 여부
  const [isSubscribed, setIsSubscribed] = useState(false)              // 구독 여부
  const [role, setRole] = useState<'admin' | 'user' | undefined>()     // 역할

  useEffect(() => {
    // onAuthStateChanged 구독 핸들(로그인/로그아웃 이벤트)
    let unsubUser: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u)

      // 🔻 비로그인: 권한 초기화 + (기존 사용자 스냅샷 구독 해제)
      if (!u) {
        setIsSubscribed(false)
        setRole(undefined)
        setLoading(false)
        if (unsubUser) { unsubUser(); unsubUser = null }
        return
      }

      // 🔻 로그인: users/{uid} 문서를 실시간 구독(onSnapshot)
      const userRef = doc(db, 'users', u.uid)
      if (unsubUser) { unsubUser(); unsubUser = null } // 기존 구독 해제(다중구독 방지)
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
          // 에러 시 안전 기본값
          setRole('user')
          setIsSubscribed(false)
          setLoading(false)
        }
      )
    })

    // 언마운트 시 정리
    return () => {
      unsubAuth()
      if (unsubUser) unsubUser()
    }
  }, [])

  const canSeeAll = role === 'admin' || isSubscribed              // ✅ 관리자/구독자면 전체 접근 허용
  const FREE_ALLOW = ['/convert']                                  // ✅ 비구독 일반 사용자 허용 경로

  useEffect(() => {
    if (loading) return

    // 1) 비로그인 사용자는 항상 '/' 로 이동
    if (!signedIn) {
      if (pathname !== '/') router.replace('/')
      return
    }

    // 2) 로그인했지만 비구독 일반 사용자 ⇒ '/convert'만 허용
    if (!canSeeAll) {
      const allowed = FREE_ALLOW.some((p) => pathname.startsWith(p))
      if (!allowed) router.replace('/convert')
    }
    // 3) 관리자/구독자는 제한 없음
  }, [loading, signedIn, canSeeAll, pathname, router])

  return (
    // ✅ 라이트/다크 기본 텍스트 상속을 올바르게 설정
    <div className="min-h-screen w-full flex text-slate-900 dark:text-white">
      {/* 좌측: 사이드바 (디자인/마크업 그대로) */}
      <Sidebar />

      {/* 우측: 헤더 + 본문 (디자인/마크업 그대로) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <LogoutHeader />
        <main className="flex-1 overflow-auto p-4">
          {/* 로딩 중에는 콘텐츠 대신 안내 한 줄만 */}
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
