'use client'
/**
 * components/Sidebar.tsx
 *
 * 변경 요약
 *  - ✅ 기존 "역할/구독"에 따른 노출 로직은 그대로 유지 (adminOnly / requiresSub)
 *  - ➕ settings/uploadPolicy.navigation.disabled 구독 추가
 *      · 배열에 포함된 slug(첫 세그먼트)는 "보여주되 비활성화" (클릭 차단 + 흐림)
 *  - UI 스타일/동작은 최대한 기존과 동일하게 유지
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'

import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

type RoleNorm = 'admin' | 'user'

// 기존 메뉴 정의 유지
const MENU_ITEMS = [
  { href: '/convert', label: 'Data Convert', requiresSub: false, adminOnly: false },
  { href: '/compare', label: 'Compare',      requiresSub: true,  adminOnly: false },
  { href: '/random',  label: 'Random',       requiresSub: true,  adminOnly: false },
  { href: '/admin',   label: 'Admin',        requiresSub: false, adminOnly: true  },
] as const

// href의 첫 세그먼트를 slug로 사용 (예: /compare → 'compare')
const hrefToSlug = (href: string) => (href.split('/').filter(Boolean)[0] || '')

export default function Sidebar() {
  const pathname = usePathname()

  // 상태: 로딩/역할/구독 (기존 로직 유지)
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

  // 🆕 settings/uploadPolicy.navigation.disabled 구독
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
      () => setDisabledSlugs([]) // 에러 시 기본값
    )
    return () => unsub()
  }, [])
  const disabledSet = useMemo(() => new Set(disabledSlugs), [disabledSlugs])

  // 로딩 중엔 깜빡임 최소화(임시로 convert만) — 기존 동작 유지
  const visible = loading
    ? MENU_ITEMS.filter(m => m.href === '/convert')
    : MENU_ITEMS.filter(m => {
        if (m.adminOnly) return isAdmin                 // Admin은 오직 관리자
        if (m.requiresSub) return isAdmin || isPaid     // 유료 메뉴는 관리자 또는 구독자
        return true                                     // 그 외 모두
      })

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
