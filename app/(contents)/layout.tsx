// app/(contents)/layout.tsx
'use client'

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
        () => {
          setRole('user'); setIsSubscribed(false); setLoading(false)
        }
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
    // ✅ 여기서는 텍스트색을 "상속" 받습니다(전역 기준 사용).
    <div className="min-h-screen w-full flex text-inherit">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <LogoutHeader />
        <main className="flex-1 overflow-auto p-4">
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
