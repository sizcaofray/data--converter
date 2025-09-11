'use client'
/**
 * components/Sidebar.tsx
 *
 * 변경 요약
 *  - Admin 메뉴는 오직 role==='admin'에서만 보임(구독자라도 admin이 아니면 숨김)
 *  - 구독자면 유료 메뉴(Compare/Random)는 노출, 비구독자는 Data Convert만
 *  - 실시간 사용자 문서 구독(onSnapshot)과 로딩 시 깜빡임 최소화는 유지
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

type RoleNorm = 'admin' | 'user'

export default function Sidebar() {
  const pathname = usePathname()

  // 상태: 로딩/역할/구독
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<RoleNorm>('user')
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    let unsubUser: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        // 비로그인 → 기본값
        setRole('user')
        setIsSubscribed(false)
        setLoading(false)
        if (unsubUser) { unsubUser(); unsubUser = null }
        return
      }

      // 로그인 → users/{uid} 실시간 구독
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

  const isAdmin = role === 'admin'
  const isPaid = !!isSubscribed

  // 메뉴 정의: adminOnly는 관리자 전용, requiresSub는 유료 메뉴
  const menuItems = [
    { href: '/convert', label: 'Data Convert', requiresSub: false, adminOnly: false },
    { href: '/compare', label: 'Compare',      requiresSub: true,  adminOnly: false },
    { href: '/random',  label: 'Random',       requiresSub: true,  adminOnly: false },
    { href: '/admin',   label: 'Admin',        requiresSub: false, adminOnly: true  },
  ] as const

  // 로딩 중엔 깜빡임 최소화(임시로 convert만)
  const visible = loading
    ? menuItems.filter(m => m.href === '/convert')
    : menuItems.filter(m => {
        if (m.adminOnly) return isAdmin                  // Admin은 오직 관리자
        if (m.requiresSub) return isAdmin || isPaid      // 유료 메뉴는 관리자 또는 구독자
        return true                                      // 나머지는 모두
      })

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
