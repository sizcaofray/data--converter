'use client'
/**
 * components/Sidebar.tsx
 *
 * 기능 요약
 *  - 관리자(role==='admin') 또는 구독자(isSubscribed===true) ⇒ 전체 메뉴 노출
 *  - 그 외(비구독 일반 사용자) ⇒ 'Data Convert'만 노출
 *  - Firestore users/{uid} 문서를 onSnapshot으로 실시간 구독하여 메뉴 즉시 갱신
 *  - 디자인/클래스는 그대로(필요 시 className만 기존 프로젝트 값으로 교체)
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

export default function Sidebar() {
  const pathname = usePathname()

  // ✅ 상태: 로딩/구독/역할
  const [loading, setLoading] = useState(true)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [role, setRole] = useState<'admin' | 'user' | undefined>()

  useEffect(() => {
    let unsubUser: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        // 비로그인 ⇒ 기본값으로 초기화
        setIsSubscribed(false)
        setRole(undefined)
        setLoading(false)
        if (unsubUser) { unsubUser(); unsubUser = null }
        return
      }

      // 로그인 ⇒ users/{uid} 실시간 구독
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

  // ⚠️ 라벨/경로는 기존 프로젝트 메뉴와 동일하게 유지하세요.
  const menuItems = [
    { href: '/convert', label: 'Data Convert', requiresSub: false },
    { href: '/compare', label: 'Compare',      requiresSub: true  },
    { href: '/random',  label: 'Random',       requiresSub: true  },
    { href: '/admin',   label: 'Admin',        requiresSub: true  },
  ]

  // 로딩 중엔 깜빡임 최소화: 임시로 convert만
  const visible = loading
    ? menuItems.filter(m => m.href === '/convert')
    : (canSeeAll ? menuItems : menuItems.filter(m => !m.requiresSub))

  return (
    <aside className="w-64 shrink-0 border-r bg-gray-50 dark:bg-gray-900 min-h-screen">
      <nav className="px-3 py-4">
        <ul className="space-y-1">
          {visible.map((m) => {
            const active = pathname === m.href || pathname.startsWith(m.href + '/')
            return (
              <li key={m.href}>
                <Link
                  href={m.href}
                  prefetch
                  className={clsx(
                    'block px-3 py-2 rounded-md text-sm transition',
                    active
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-gray-900 dark:text-white hover:bg-blue-100/70 dark:hover:bg-blue-800/40'
                  )}
                >
                  {m.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
