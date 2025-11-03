'use client'

/**
 * 내부 레이아웃 (사이드바가 footer 라인까지 자연스럽게 이어지고,
 * 불필요한 스크롤은 다시 생기지 않도록 구성)
 *
 * 변경 포인트
 * - 사이드바 래퍼의 min-h-screen 제거
 * - 최상위 컨테이너에 min-h-full + grid(2열) 적용 → 부모의 높이를 그대로 채택
 * - border-r, 배경은 좌측 컬럼 래퍼에만 적용 (Sidebar.tsx 중복 border/bg는 제거 권장)
 * - main 쪽 overflow-auto 금지(overflow-visible 유지)
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

  const canSeeAll = role === 'admin' || isSubscribed
  const FREE_ALLOW = ['/convert']

  useEffect(() => {
    if (loading) return
    if (!signedIn) { if (pathname !== '/') router.replace('/'); return }
    if (!canSeeAll) {
      const allowed = FREE_ALLOW.some((p) => pathname.startsWith(p))
      if (!allowed) router.replace('/convert')
    }
  }, [loading, signedIn, canSeeAll, pathname, router])

  return (
    /**
     * 부모(body)는 app/layout.tsx 에서 `min-h-screen flex flex-col` 입니다.
     * 아래 컨테이너가 그 높이를 채택하도록 `min-h-full`을 주고,
     * 2열 그리드(왼쪽: 16rem, 오른쪽: 나머지)로 분리합니다.
     */
    <div className="w-full h-full grid grid-cols-[16rem_1fr] text-inherit">
      {/* 좌측 사이드 영역 래퍼: 여기서만 배경/경계 적용 (겹침 방지) */}
      <div className="h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-700/50">
        <Sidebar />
      </div>

      {/* 우측 영역: 헤더 + 본문 */}
      <div className="min-w-0 flex flex-col">
        <LogoutHeader />
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
