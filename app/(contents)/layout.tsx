'use client'
/**
 * app/(contents)/layout.tsx
 * - ✅ 비로그인 → 항상 메인('/')으로 이동
 * - ✅ 로그인 & (admin 또는 isSubscribed) → 전체 접근
 * - ✅ 로그인 & (비구독 일반사용자) → '/convert'만 허용
 * - 헤더/사이드바 디자인은 건드리지 않고 로직만 추가
 */

import React, { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import LogoutHeader from '@/components/LogoutHeader' // 기존 헤더 컴포넌트
import { usePathname, useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

export default function ContentsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)                // ✅ 추가: 로그인 여부
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [role, setRole] = useState<'admin' | 'user' | undefined>(undefined)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setSignedIn(!!u)                                           // ✅ 추가
      if (!u) {
        setIsSubscribed(false)
        setRole(undefined)
        setLoading(false)
        return
      }
      try {
        const ref = doc(db, 'users', u.uid)
        const snap = await getDoc(ref)
        const data = snap.exists() ? (snap.data() as any) : {}
        setIsSubscribed(!!data.isSubscribed)
        setRole((data.role as 'admin' | 'user') ?? 'user')
      } catch {
        setIsSubscribed(false)
        setRole('user')
      } finally {
        setLoading(false)
      }
    })
    return () => unsub()
  }, [])

  const canSeeAll = (role === 'admin') || isSubscribed
  const FREE_ALLOW = ['/convert']

  useEffect(() => {
    if (loading) return

    // ✅ 1) 비로그인 사용자는 항상 메인('/')으로 이동
    if (!signedIn) {
      if (pathname !== '/') router.replace('/')
      return
    }

    // ✅ 2) 로그인했지만 비구독 일반사용자면 '/convert'만 허용
    if (!canSeeAll) {
      const allowed = FREE_ALLOW.some((p) => pathname.startsWith(p))
      if (!allowed) router.replace('/convert')
    }
    // ✅ 3) 관리자/구독자는 제한 없음
  }, [loading, signedIn, canSeeAll, pathname, router])          // ✅ 의존성에 signedIn 추가

  return (
    <div className="min-h-screen w-full flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* ✅ 기존 헤더 컴포넌트를 그대로 사용 (디자인 유지) */}
        <LogoutHeader />
        <main className="flex-1 overflow-auto p-4">
          {loading ? <div className="text-sm text-gray-500">권한 확인 중…</div> : children}
        </main>
      </div>
    </div>
  )
}
