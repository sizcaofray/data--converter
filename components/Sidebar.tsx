'use client'
/**
 * Sidebar
 * - 관리자 설정(settings/uploadPolicy.navigation.disabled)과 슬러그 정규화 매핑 적용
 * - 비활성화된 메뉴는 <span> 렌더(클릭/포커스 불가)
 * - 기존 권한/구독/관리자 노출 로직 유지
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'

import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

type MenuItem = {
  slug: string      // 내부 기준 슬러그 (route 기준)
  label: string
  href: string
  adminOnly?: boolean
  requiresSub?: boolean
}

// 내부 기준 슬러그 정의(변경 없음)
const MENUS: MenuItem[] = [
  { slug: 'convert', label: 'Data Convert', href: '/convert' },
  { slug: 'compare', label: 'Compare', href: '/compare' },
  { slug: 'pdf', label: 'PDF Tool', href: '/pdf' },
  { slug: 'pattern', label: 'Pattern Editor', href: '/pattern' },
  { slug: 'random', label: 'Random', href: '/random' },
  { slug: 'admin', label: 'Admin', href: '/admin', adminOnly: true },
]

// 관리자 문서 타입
type UploadPolicy = {
  navigation?: { disabled?: string[] }
}

// ✅ 관리자에서 저장하는 문자열을 내부 슬러그로 정규화
function normalizeSlug(input: string): string {
  const s = String(input || '').trim().toLowerCase()
  switch (s) {
    case 'pdf-tool':
      return 'pdf'
    case 'pattern-editor':
      return 'pattern'
    default:
      return s
  }
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
        const list = data.navigation?.disabled ?? []
        // 👉 normalize 적용
        setDisabledSlugs(list.map(normalizeSlug))
      },
      () => setDisabledSlugs([])
    )
    return () => unsub()
  }, [])

  // 화면에 뿌릴 메뉴 계산
  const menuView = useMemo(() => {
    const canSeeAll = role === 'admin' || isSubscribed
    return MENUS.map((m) => {
      const isDisabledByAdmin = disabledSlugs.includes(m.slug)
      const hidden =
        (!signedIn && m.slug !== 'convert') || // 비로그인: convert만 노출
        (m.adminOnly && role !== 'admin') ||   // admin 전용
        (m.requiresSub && !canSeeAll)         // 구독 필요
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
              'opacity-40 cursor-not-allowed'

            return (
              <li key={m.slug}>
                {m.isDisabled ? (
                  // ✅ 완전 비활성(클릭·탭 불가)
                  <span
                    className={clsx(baseClass, disabledClass)}
                    aria-disabled="true"
                    title="관리자에 의해 비활성화됨"
                  >
                    {m.label}
                  </span>
                ) : (
                  <Link href={m.href} className={clsx(baseClass, enabledClass)}>
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
