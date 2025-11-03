// components/Sidebar.tsx
'use client'
/**
 * 변경 요약
 * - 비활성화(disabled) 메뉴는 <Link> 대신 <span>으로 렌더링 → 클릭/탭 포커스 모두 불가
 * - 시각적 스타일은 동일하게 유지(회색/투명도, not-allowed 커서)
 * - 기존 권한/구독/관리자 노출 로직, Firestore uploadPolicy 구독 그대로 유지
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'

import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

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

type UploadPolicy = {
  navigation?: { disabled?: string[] }
}

export default function Sidebar() {
  const pathname = usePathname()

  const [signedIn, setSignedIn] = useState(false)
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([])

  // 로그인/유저 구독
  useEffect(() => {
    let unsubUser: (() => void) | null = null
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u)
      if (!u) {
        setRole('user'); setIsSubscribed(false); setDisabledSlugs([])
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

  // settings/uploadPolicy.navigation.disabled 구독
  useEffect(() => {
    const ref = doc(db, 'settings', 'uploadPolicy')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {}
        setDisabledSlugs((data.navigation?.disabled ?? []).map(String))
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
        (!signedIn && m.slug !== 'convert') ||   // 비로그인: convert만 노출
        (m.adminOnly && role !== 'admin') ||     // admin 전용
        (m.requiresSub && !canSeeAll)            // 구독 필요
      return { ...m, hidden, isDisabled: isDisabledByAdmin }
    })
  }, [signedIn, role, isSubscribed, disabledSlugs])

  return (
    <aside className="w-64 shrink-0">
      <div className="px-3 py-3 text-xs uppercase tracking-wider opacity-60">Menu</div>
      <nav className="px-2 pb-4">
        <ul className="space-y-1">
          {menuView.filter((m) => !m.hidden).map((m) => {
            const active = pathname.startsWith(m.href)
            const baseClass =
              'block rounded-md px-3 py-2 text-sm transition select-none'
            const enabledClass = active
              ? 'bg-blue-600 text-white font-semibold'
              : 'text-gray-900 dark:text-white hover:bg-blue-100/70 dark:hover:bg-blue-800/40'
            const disabledClass =
              'opacity-40 cursor-not-allowed' // 클릭/탭 불가 표현

            return (
              <li key={m.slug}>
                {m.isDisabled ? (
                  // ✅ 완전 비활성: Link 대신 span 렌더 → 클릭/탭 모두 불가
                  <span
                    className={clsx(baseClass, disabledClass)}
                    aria-disabled="true"
                    title="관리자에 의해 비활성화됨"
                  >
                    {m.label}
                  </span>
                ) : (
                  // 활성 메뉴는 Link
                  <Link
                    href={m.href}
                    className={clsx(baseClass, enabledClass)}
                  >
                    {m.label}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
