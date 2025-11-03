'use client'

/**
 * 내부 레이아웃
 * - 좌: 사이드바 컬럼(배경만 담당)
 * - 우: 로그아웃 헤더 + 본문
 * - ✅ 불필요 스크롤 방지(overflow-auto 제거)
 * - ✅ 사이드바 배경/구분선은 전역에서 그리므로 여기서 border 제거
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
        () => { setRole('user'); setIsSubscribed(false); setLoading(false) }
      )
    })

    return () => { unsubAuth(); if (unsubUser) unsubUser() }
  }, [])

  // 접근 가드
  const canSeeAll = role === 'admin' || isSubscribed
  const FREE_ALLOW = ['/convert']

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
    // ✅ 부모(body)의 flex-1 높이를 그대로 채택(h-full) + 2열 그리드
    <div className="w-full h-full grid grid-cols-[16rem_1fr] text-inherit">
      {/* 좌측 컬럼: 배경만 담당(경계선은 전역에서 그림) */}
      <div className="h-full bg-gray-50 dark:bg-gray-900">
        <Sidebar />
      </div>

      {/* 우측 컬럼 */}
      <div className="min-w-0 flex flex-col">
        <LogoutHeader />
        {/* ✅ 내부 이중 스크롤 금지 */}
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
