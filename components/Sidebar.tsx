'use client'
/**
 * Sidebar.tsx
 * - 관리자(role==='admin') 또는 구독자(isSubscribed===true) ⇒ 전체 메뉴 노출
 * - 그 외(비구독 일반 사용자) ⇒ Data Convert만 노출
 * - 디자인/클래스 구조는 기존과 동일하게 유지하세요. (필요시 아래 className만 기존 값으로 바꾸면 됨)
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import clsx from 'clsx'

export default function Sidebar() {
  const pathname = usePathname()

  // 🔐 상태
  const [loading, setLoading] = useState(true)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [role, setRole] = useState<'admin' | 'user' | undefined>(undefined)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
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

  // ⚠️ 라벨/경로는 기존 그대로 유지
  const menuItems = [
    { href: '/convert', label: 'Data Convert', requiresSub: false },
    { href: '/compare', label: 'Compare',      requiresSub: true  },
    { href: '/random',  label: 'Random',       requiresSub: true  },
    { href: '/admin',   label: 'Admin',        requiresSub: true  },
  ]

  // 로딩 중에는 깜빡임 방지: convert만 임시 노출
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
