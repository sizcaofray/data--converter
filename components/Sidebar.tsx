'use client'
/**
 * Sidebar (유료화 적용 반영)
 * - 관리자 비활성화(settings/uploadPolicy.navigation.disabled) + ✅ 유료화(settings/uploadPolicy.navigation.paid) 동시 반영
 * - 비로그인: 기존 정책 유지(예: convert만 노출 등, 필요 시 그대로)
 * - 결과: '유료화 적용' + 비구독자 → 보이되 비활성(클릭 차단), 관리자/구독자는 활성
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
}

const MENUS: MenuItem[] = [
  { slug: 'convert',         label: 'Data Convert',   href: '/convert' },
  { slug: 'compare',         label: 'Compare',        href: '/compare' },
  { slug: 'pdf-tool',        label: 'PDF Tool',       href: '/pdf-tool' },
  { slug: 'pattern-editor',  label: 'Pattern Editor', href: '/pattern-editor' },
  { slug: 'random',          label: 'Random',         href: '/random' },
  { slug: 'admin',           label: 'Admin',          href: '/admin', adminOnly: true },
]

type UploadPolicy = {
  navigation?: { disabled?: string[]; paid?: string[] } // ✅ paid 추가
}

/** 소문자/트림 정규화 */
const norm = (v: string) => String(v || '').trim().toLowerCase()

/** 과거 키와 혼재 대응 (pdf ↔ pdf-tool, pattern ↔ pattern-editor) */
function normalizeToInternalSlug(input: string): string {
  const s = norm(input)
  switch (s) {
    case 'pdf': return 'pdf-tool'
    case 'pattern': return 'pattern-editor'
    default: return s
  }
}

export default function Sidebar() {
  const pathname = usePathname()

  const [signedIn, setSignedIn] = useState(false)
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [isSubscribed, setIsSubscribed] = useState(false)

  /** 관리자 비활성/유료화 목록 */
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([])
  const [paidSlugs, setPaidSlugs] = useState<string[]>([]) // ✅

  // 로그인/프로필 구독 (role, isSubscribed)
  useEffect(() => {
    let unsubUser: (() => void) | null = null
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u)
      if (!u) {
        setRole('user')
        setIsSubscribed(false)
        if (unsubUser) { unsubUser(); unsubUser = null }
        return
      }
      const userRef = doc(db, 'users', u.uid)
      if (unsubUser) { unsubUser(); unsubUser = null }
      unsubUser = onSnapshot(userRef, (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {}
        const roleNorm = norm(data.role ?? 'user')
        setRole(roleNorm === 'admin' ? 'admin' : 'user')
        setIsSubscribed(Boolean(data.isSubscribed))
      })
    })
    return () => { unsubAuth(); if (unsubUser) unsubUser() }
  }, [])

  // 관리자 정책(settings/uploadPolicy) 구독
  useEffect(() => {
    const ref = doc(db, 'settings', 'uploadPolicy')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {}
        const rawDisabled = data.navigation?.disabled ?? []
        const rawPaid = data.navigation?.paid ?? [] // ✅
        setDisabledSlugs(rawDisabled.map(normalizeToInternalSlug))
        setPaidSlugs(rawPaid.map(normalizeToInternalSlug))
      },
      () => { setDisabledSlugs([]); setPaidSlugs([]) }
    )
    return () => unsub()
  }, [])

  // 메뉴 표시 상태 계산
  const menuView = useMemo(() => {
    return MENUS.map((m) => {
      // 관리자 전용 숨김
      const hidden =
        (!signedIn && m.slug !== 'convert') ||  // 비로그인 정책 유지 필요 시
        (m.adminOnly && role !== 'admin')

      // 관리자 비활성 스위치 우선
      const disabledByAdmin = disabledSlugs.includes(m.slug)

      // ✅ 유료화 적용: paidSlugs에 포함 + (관리자/구독자 아님) → 비활성
      const paidApplied = paidSlugs.includes(m.slug)
      const disabledByPaid = paidApplied && !(role === 'admin' || isSubscribed)

      return {
        ...m,
        hidden,
        isDisabled: disabledByAdmin || disabledByPaid,
        isPaid: paidApplied,
      }
    })
  }, [signedIn, role, isSubscribed, disabledSlugs, paidSlugs])

  return (
    <aside className="w-64 shrink-0">
      <div className="px-3 py-3 text-xs uppercase tracking-wider opacity-60">Menu</div>
      <nav className="px-2 pb-4">
        <ul className="space-y-1">
          {menuView.filter((m) => !m.hidden).map((m) => {
            const active = pathname.startsWith(m.href)
            const base = 'group block rounded-md px-3 py-2 text-sm transition select-none'
            const enabled = active
              ? 'bg-blue-600 text-white font-semibold'
              : 'text-gray-900 dark:text-white hover:bg-blue-100/70 dark:hover:bg-blue-800/40'
            const disabled = 'opacity-40 cursor-not-allowed'

            const label = (
              <span className="inline-flex items-center gap-2">
                {m.label}
                {/* 유료화 배지 표시(선택) */}
                {m.isPaid && (
                  <span className="text-[10px] rounded px-1.5 py-0.5 border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-900/20">
                    유료
                  </span>
                )}
              </span>
            )

            return (
              <li key={m.slug}>
                {m.isDisabled ? (
                  // 보이되 비활성(클릭 차단)
                  <span className={clsx(base, disabled)} aria-disabled="true" title={m.isPaid ? '구독이 필요합니다' : '관리자에 의해 비활성화됨'}>
                    {label}
                  </span>
                ) : (
                  <Link href={m.href} className={clsx(base, enabled)}>
                    {label}
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
