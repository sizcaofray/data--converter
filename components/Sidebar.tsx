// components/Sidebar.tsx
'use client'
/**
 * 변경 요약
 *  - ✅ 기존 '역할/구독' 노출 로직 유지 (adminOnly / requiresSub)
 *  - ➕ settings/uploadPolicy.navigation.disabled 구독 → 포함된 slug는 "보여주되 비활성화"
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'

import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

type RoleNorm = 'admin' | 'user'

const MENU_ITEMS = [
  { href: '/convert', label: 'Data Convert', requiresSub: false, adminOnly: false },
  { href: '/compare', label: 'Compare',      requiresSub: true,  adminOnly: false },
  { href: '/random',  label: 'Random',       requiresSub: true,  adminOnly: false },
  { href: '/admin',   label: 'Admin',        requiresSub: false, adminOnly: true  },
] as const

const hrefToSlug = (href: string) => (href.split('/').filter(Boolean)[0] || '')

export default function Sidebar() {
  const pathname = usePathname()

  // --- 기존: 역할/구독 구독
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<RoleNorm>('user')
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    let unsubUser: (() => void) | null = null
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setRole('user'); setIsSubscribed(false); setLoading(false)
        if (unsubUser) { unsubUser(); unsubUser = null }
        return
      }
      const userRef = doc(db, 'users', u.uid)
      if (unsubUser) { unsubUser(); unsubUser = null }
      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          const d = snap.exists() ? (snap.data() as any) : {}
          setRole(String(d.role ?? 'user').toLowerCase() === 'admin' ? 'admin' : 'user')
          setIsSubscribed(Boolean(d.isSubscribed))
          setLoading(false)
        },
        () => { setRole('user'); setIsSubscribed(false); setLoading(false) }
      )
    })
    return () => { unsubAuth(); if (unsubUser) unsubUser() }
  }, [])

  const isAdmin = role === 'admin'
  const isPaid = !!isSubscribed

  // --- 추가: settings/uploadPolicy.navigation.disabled 구독
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([])
  useEffect(() => {
    const ref = doc(db, 'settings', 'uploadPolicy')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() as any | undefined
        const arr = data?.navigation?.disabled
        setDisabledSlugs(Array.isArray(arr) ? arr : [])
      },
      () => setDisabledSlugs([])
    )
    return () => unsub()
  }, [])
  const disabledSet = useMemo(() => new Set(disabledSlugs), [disabledSlugs])

  // --- 노출 판단(기존 로직 그대로)
  const visible = loading
    ? MENU_ITEMS.filter(m => m.href === '/convert')
    : MENU_ITEMS.filter(m => (m.adminOnly ? isAdmin : m.requiresSub ? (isAdmin || isPaid) : true))

  return (
    <aside className="w-64 shrink-0 border-r bg-gray-50 dark:bg-gray-900 min-h-screen">
      <nav className="px-3 py-4">
        <ul className="space-y-1">
          {visible.map((m) => {
            const active = pathname === m.href || pathname.startsWith(m.href + '/')
            const slug = hrefToSlug(m.href)
            const isDisabled = disabledSet.has(slug)
            return (
              <li key={m.href}>
                <Link
                  href={m.href}
                  prefetch
                  aria-disabled={isDisabled}
                  tabIndex={isDisabled ? -1 : 0}
                  onClick={(e) => { if (isDisabled) e.preventDefault() }}
                  className={clsx(
                    'block px-3 py-2 rounded-md text-sm transition',
                    isDisabled
                      ? 'pointer-events-none opacity-50 cursor-not-allowed bg-slate-100/50 dark:bg-slate-800/30'
                      : active
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-gray-900 dark:text-white hover:bg-blue-100/70 dark:hover:bg-blue-800/40'
                  )}
                  title={isDisabled ? '관리자에 의해 비활성화됨' : m.label}
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
