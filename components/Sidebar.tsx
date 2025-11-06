'use client'
/**
 * Sidebar (유료화 적용 + 초기 로딩 레이스 방지, 최소 변경)
 * - 관리자 비활성화(settings/uploadPolicy.navigation.disabled) + 유료화(settings/uploadPolicy.navigation.paid)
 * - 정책 로딩 중(policyLoading): 관리자/구독자 제외 일반 유저는 임시 비활성 → 초기 클릭 리다이렉트 방지
 * - 기존 스타일/표시 그대로 유지
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
  /** 구독 필요 여부(실제 표시 계산에서만 사용) */
  requiresSub?: boolean
}

/* 라우트/슬러그를 실제 페이지에 맞춰 통일 (기존 유지) */
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
  navigation?: { disabled?: string[]; paid?: string[] } // ✅ paid 추가
}

/** 소문자/트림 정규화 */
const norm = (v: string) => String(v || '').trim().toLowerCase()

/** 관리자 설정 키 혼재 대응 (기존 유지) */
function normalizeToInternalSlug(input: string): string {
  const s = norm(input)
  switch (s) {
    case 'pdf':     return 'pdf-tool'
    case 'pattern': return 'pattern-editor'
    default:        return s
  }
}

export default function Sidebar() {
  const pathname = usePathname()

  const [signedIn, setSignedIn] = useState(false)
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [isSubscribed, setIsSubscribed] = useState(false)

  /** 관리자에서 비활성화한 슬러그 */
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([])
  /** ✅ 유료화 적용 슬러그 */
  const [paidSlugs, setPaidSlugs] = useState<string[]>([])
  /** ✅ 정책 로딩 상태(레이스 방지용) */
  const [policyLoading, setPolicyLoading] = useState(true)

  // 로그인/유저 문서 구독 (역할/구독 여부) — 기존 유지
  useEffect(() => {
    let unsubUser: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u)

      if (!u) {
        setRole('user')
        setIsSubscribed(false)
        setDisabledSlugs([])
        setPaidSlugs([])
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

  // 관리자 비활성/유료화 목록 구독 — ✅ paid 함께 처리 + 로딩 상태 관리
  useEffect(() => {
    setPolicyLoading(true)
    const ref = doc(db, 'settings', 'uploadPolicy')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {}
        const rawDisabled = data.navigation?.disabled ?? []
        const rawPaid = data.navigation?.paid ?? []
        setDisabledSlugs(rawDisabled.map(normalizeToInternalSlug))
        setPaidSlugs(rawPaid.map(normalizeToInternalSlug))
        setPolicyLoading(false)
      },
      () => {
        setDisabledSlugs([])
        setPaidSlugs([])
        setPolicyLoading(false)
      }
    )
    return () => unsub()
  }, [])

  // 화면 출력용 메뉴 계산
  const menuView = useMemo(() => {
    const canSeeAll = role === 'admin' || isSubscribed

    return MENUS.map((m) => {
      // (기존) 비로그인 정책/관리자 전용
      const hidden =
        (!signedIn && m.slug !== 'convert') ||
        (m.adminOnly && role !== 'admin')

      // ✅ 유료화 적용: paid 배열에 포함되면 구독 필요
      const requiresSub = paidSlugs.includes(m.slug)

      // (기존) 관리자 비활성 스위치
      const isDisabledByAdmin = disabledSlugs.includes(m.slug)

      // ✅ 유료화에 따른 비활성
      const isDisabledByPaid = requiresSub && !canSeeAll

      // ✅ 정책 로딩 중: 비관리자·비구독자는 임시 비활성(초기 클릭 리다이렉트 방지)
      const isDisabledByLoading = policyLoading && !canSeeAll

      return {
        ...m,
        requiresSub,
        hidden,
        isDisabled: isDisabledByAdmin || isDisabledByPaid || isDisabledByLoading,
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

            return (
              <li key={m.slug}>
                {m.isDisabled ? (
                  // ✅ 완전 비활성: 클릭/탭 불가
                  <span
                    className={clsx(base, disabled)}
                    aria-disabled="true"
                    title={
                      policyLoading && !(role === 'admin' || isSubscribed)
                        ? '정책 로딩 중'
                        : (m.requiresSub && !(role === 'admin' || isSubscribed))
                        ? '구독이 필요합니다'
                        : '관리자에 의해 비활성화됨'
                    }
                  >
                    <span className="inline-flex items-center gap-2">
                      {m.label}
                      {m.requiresSub && (
                        <span className="text-[10px] rounded px-1.5 py-0.5 border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-900/20">
                          유료
                        </span>
                      )}
                      {policyLoading && !(role === 'admin' || isSubscribed) && (
                        <span className="text-[10px] ml-1 opacity-60">로딩중</span>
                      )}
                    </span>
                  </span>
                ) : (
                  <Link href={m.href} className={clsx(base, enabled)}>
                    <span className="inline-flex items-center gap-2">
                      {m.label}
                      {m.requiresSub && (
                        <span className="text-[10px] rounded px-1.5 py-0.5 border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-900/20">
                          유료
                        </span>
                      )}
                    </span>
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
