'use client'
/**
 * Sidebar (유료화 적용 + 초기 로딩 레이스컨디션 방지)
 * - 관리자 비활성화(settings/uploadPolicy.navigation.disabled) + 유료화(settings/uploadPolicy.navigation.paid)
 * - 🔒 policyLoading 동안: 관리자/구독자 제외, 일반 유저는 임시로 메뉴 비활성화 → 초기 클릭에 의한 리다이렉트 방지
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
  navigation?: { disabled?: string[]; paid?: string[] }
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

  // 정책 로딩 상태 (🔥 핵심)
  const [policyLoading, setPolicyLoading] = useState(true)

  // 관리자 비활성/유료화 목록
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([])
  const [paidSlugs, setPaidSlugs] = useState<string[]>([])

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
    setPolicyLoading(true) // ⏳ 스냅샷 도착 전까지 로딩 상태
    const ref = doc(db, 'settings', 'uploadPolicy')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {}
        const rawDisabled = data.navigation?.disabled ?? []
        const rawPaid = data.navigation?.paid ?? []
        setDisabledSlugs(rawDisabled.map(normalizeToInternalSlug))
        setPaidSlugs(rawPaid.map(normalizeToInternalSlug))
        setPolicyLoading(false) // ✅ 첫 스냅샷 수신 완료
      },
      () => {
        setDisabledSlugs([])
        setPaidSlugs([])
        setPolicyLoading(false) // 오류여도 로딩 종료
      }
    )
    return () => unsub()
  }, [])

  // 메뉴 표시 상태 계산
  const menuView = useMemo(() => {
    return MENUS.map((m) => {
      // 관리자 전용 숨김
      const hidden =
        (!signedIn && m.slug !== 'convert') ||
        (m.adminOnly && role !== 'admin')

      // 관리자 비활성 스위치
      const disabledByAdmin = disabledSlugs.includes(m.slug)

      // 유료화 적용 여부
      const paidApplied = paidSlugs.includes(m.slug)
      const disabledByPaid = paidApplied && !(role === 'admin' || isSubscribed)

      // ⏳ 정책 로딩 중 보호: 일반 유저(비관리자/비구독)는 임시 비활성
      const disabledByLoading =
        policyLoading && !(role === 'admin' || isSubscribed)

      return {
        ...m,
        hidden,
        isPaid: paidApplied,
        isDisabled: disabledByAdmin || disabledByPaid || disabledByLoading,
      }
    })
  }, [signedIn, role, isSubscribed, disabledSlugs, paidSlugs, policyLoading])

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
                {m.isPaid && (
                  <span className="text-[10px] rounded px-1.5 py-0.5 border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-900/20">
                    유료
                  </span>
                )}
                {policyLoading && !(role === 'admin' || isSubscribed) && (
                  <span className="text-[10px] ml-1 opacity-60">로딩중</span>
                )}
              </span>
            )

            return (
              <li key={m.slug}>
                {m.isDisabled ? (
                  // 보이되 비활성(클릭 차단)
                  <span
                    className={clsx(base, disabled)}
                    aria-disabled="true"
                    title={
                      policyLoading && !(role === 'admin' || isSubscribed)
                        ? '정책 로딩 중'
                        : m.isPaid
                        ? '구독이 필요합니다'
                        : '관리자에 의해 비활성화됨'
                    }
                  >
                    {label}
                  </span>
                ) : (
                  <Link
                    href={m.href}
                    className={clsx(base, enabled)}
                  >
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
