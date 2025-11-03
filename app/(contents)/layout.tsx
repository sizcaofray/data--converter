'use client'

/**
 * 내부 레이아웃
 * - 좌측: Sidebar 컬럼(배경 + border-r)
 * - 우측: LogoutHeader + 페이지 본문
 * - 불필요한 이중 스크롤 방지(overflow-visible)
 * - 접근 가드 로직 유지
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
        if (unsubUser) {
          unsubUser()
          unsubUser = null
        }
        return
      }

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
    // 본문 높이만큼만 차는 2열 그리드 (푸터는 전역 app/layout.tsx에 있음)
    <div className="w-full h-full grid grid-cols-[16rem_1fr] text-inherit">
      {/* 좌측 컬럼: 배경 + 경계선 */}
      <div className="h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-700/50">
        <Sidebar />
      </div>

      {/* 우측 컬럼 */}
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
