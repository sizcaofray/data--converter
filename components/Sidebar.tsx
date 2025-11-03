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

// === 메뉴 정의(기존 유지) ===
type MenuItem = {
  slug: string
  label: string
  href: string
  adminOnly?: boolean
  requiresSub?: boolean
}

const MENUS: MenuItem[] = [
  { slug: 'convert', label: 'Data Convert', href: '/convert' },
  { slug: 'compare', label: 'Compare', href: '/compare' },
  { slug: 'pdf', label: 'PDF Tool', href: '/pdf' },
  { slug: 'pattern', label: 'Pattern Editor', href: '/pattern' },
  { slug: 'random', label: 'Random', href: '/random' },
  { slug: 'admin', label: 'Admin', href: '/admin', adminOnly: true },
]

// settings/uploadPolicy.navigation.disabled 구독용 타입
type UploadPolicy = {
  navigation?: {
    disabled?: string[] // slug 배열
  }
}

export default function Sidebar() {
  const pathname = usePathname()

  const [signedIn, setSignedIn] = useState(false)
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([])

  // 로그인/유저 상태
  useEffect(() => {
    let unsubUser: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u)

      if (!u) {
        setRole('user')
        setIsSubscribed(false)
        setDisabledSlugs([])
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
        },
        () => { setRole('user'); setIsSubscribed(false) }
      )
    })

    return () => { unsubAuth(); if (unsubUser) unsubUser() }
  }, [])

  // settings/uploadPolicy 구독(관리자 비활성화 메뉴)
  useEffect(() => {
    const ref = doc(db, 'settings', 'uploadPolicy')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {}
        const disabled = data.navigation?.disabled ?? []
        setDisabledSlugs(disabled.map(String))
      },
      () => setDisabledSlugs([])
    )
    return () => unsub()
  }, [])

  const menuView = useMemo(() => {
    const canSeeAll = role === 'admin' || isSubscribed
    return MENUS.map((m) => {
      const isDisabledByAdmin = disabledSlugs.includes(m.slug)
      const hidden =
        (!signedIn && m.slug !== 'convert') || // 비로그인: convert만
        (m.adminOnly && role !== 'admin') || // admin 전용
        (m.requiresSub && !canSeeAll) // 구독 필요
      return { ...m, hidden, isDisabled: isDisabledByAdmin }
    })
  }, [signedIn, role, isSubscribed, disabledSlugs])

  // ✅ 최상단 aside: 높이/경계/배경 제거 (전역에서 처리)
  return (
    <aside className="w-64 shrink-0">
      <div className="px-3 py-3 text-xs uppercase tracking-wider opacity-60">Menu</div>
      <nav className="px-2 pb-4">
        <ul className="space-y-1">
          {menuView.filter((m) => !m.hidden).map((m) => {
            const active = pathname.startsWith(m.href)
            const isDisabled = m.isDisabled
            return (
              <li key={m.slug}>
                <Link
                  href={isDisabled ? '#' : m.href}
                  className={clsx(
                    'block rounded-md px-3 py-2 text-sm transition',
                    isDisabled
                      ? 'opacity-40 pointer-events-none'
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
