'use client'
/**
 * Sidebar (최종)
 * - 라우트: /pdf-tool, /pattern-editor 로 통일
 * - 관리자 비활성화(settings/uploadPolicy.navigation.disabled) 키 혼재 대비:
 *   'pdf-tool' <-> 'pdf', 'pattern-editor' <-> 'pattern' 양방향 매핑 지원
 * - 비활성 메뉴는 <span>으로 렌더 → 클릭/포커스 완전 차단
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
  /** 내부 기준 슬러그(관리자 비활성화와 1:1 매칭) */
  slug: string
  /** 화면 라벨 */
  label: string
  /** 라우트 경로 */
  href: string
  /** 관리자 전용 여부 */
  adminOnly?: boolean
  /** 구독 필요 여부 */
  requiresSub?: boolean
}

/* 라우트/슬러그를 실제 페이지에 맞춰 통일 */
const MENUS: MenuItem[] = [
  { slug: 'convert',         label: 'Data Convert',   href: '/convert' },
  { slug: 'compare',         label: 'Compare',        href: '/compare' },
  { slug: 'pdf-tool',        label: 'PDF Tool',       href: '/pdf-tool' },
  { slug: 'pattern-editor',  label: 'Pattern Editor', href: '/pattern-editor' },
  { slug: 'random',          label: 'Random',         href: '/random' },
  { slug: 'admin',           label: 'Admin',          href: '/admin', adminOnly: true },
]

/** Firestore 문서 형태 */
type UploadPolicy = {
  navigation?: { disabled?: string[] }
}

/** 소문자/트림 정규화 */
const norm = (v: string) => String(v || '').trim().toLowerCase()

/**
 * 관리자 설정 키 혼재 대응:
 *  - 'pdf-tool' <-> 'pdf'
 *  - 'pattern-editor' <-> 'pattern'
 * 둘 중 무엇이 와도 내부 기준으로 'pdf-tool' / 'pattern-editor'로 매핑
 */
function normalizeToInternalSlug(input: string): string {
  const s = norm(input)
  switch (s) {
    case 'pdf':
      return 'pdf-tool'
    case 'pattern':
      return 'pattern-editor'
    default:
      return s
  }
}

export default function Sidebar() {
  const pathname = usePathname()

  const [signedIn, setSignedIn] = useState(false)
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [isSubscribed, setIsSubscribed] = useState(false)

  /** 관리자에서 비활성화한 슬러그(내부 기준으로 정규화된 값) */
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([])

  // 로그인/유저 문서 구독 (역할/구독 여부)
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
          const roleNorm = norm(data.role ?? 'user')
          setRole(roleNorm === 'admin' ? 'admin' : 'user')
          setIsSubscribed(Boolean(data.isSubscribed))
        },
        () => {
          setRole('user')
          setIsSubscribed(false)
        }
      )
    })

    return () => { unsubAuth(); if (unsubUser) unsubUser() }
  }, [])

  // 관리자 비활성 메뉴(settings/uploadPolicy.navigation.disabled) 구독
  useEffect(() => {
    const ref = doc(db, 'settings', 'uploadPolicy')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {}
        const raw = data.navigation?.disabled ?? []
        // 과거/현재 키 혼재 대응 → 내부 기준으로 통일
        setDisabledSlugs(raw.map(normalizeToInternalSlug))
      },
      () => setDisabledSlugs([])
    )
    return () => unsub()
  }, [])

  // 화면 출력용 메뉴 계산
  const menuView = useMemo(() => {
    const canSeeAll = role === 'admin' || isSubscribed
    return MENUS.map((m) => {
      const hidden =
        (!signedIn && m.slug !== 'convert') ||  // 비로그인: convert만 노출
        (m.adminOnly && role !== 'admin') ||    // 관리자 전용
        (m.requiresSub && !canSeeAll)           // 구독 필요
      const isDisabled = disabledSlugs.includes(m.slug)
      return { ...m, hidden, isDisabled }
    })
  }, [signedIn, role, isSubscribed, disabledSlugs])

  return (
    <aside className="w-64 shrink-0">
      <div className="px-3 py-3 text-xs uppercase tracking-wider opacity-60">Menu</div>
      <nav className="px-2 pb-4">
        <ul className="space-y-1">
          {menuView.filter((m) => !m.hidden).map((m) => {
            const active = pathname.startsWith(m.href)
            const base = 'block rounded-md px-3 py-2 text-sm transition select-none'
            const enabled = active
              ? 'bg-blue-600 text-white font-semibold'
              : 'text-gray-900 dark:text-white hover:bg-blue-100/70 dark:hover:bg-blue-800/40'
            const disabled = 'opacity-40 cursor-not-allowed'

            return (
              <li key={m.slug}>
                {m.isDisabled ? (
                  // ✅ 완전 비활성: 클릭/탭 불가
                  <span
                    className={clsx(base, disabled)}
                    aria-disabled="true"
                    title="관리자에 의해 비활성화됨"
                  >
                    {m.label}
                  </span>
                ) : (
                  <Link href={m.href} className={clsx(base, enabled)}>
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
