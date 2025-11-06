'use client'

/**
 * 내부 레이아웃
 * - 좌측: Sidebar
 * - 우측: LogoutHeader + children
 * - ✅ 접근 가드: Firestore 정책(navigation.disabled / navigation.paid) 기반 동적 허용
 *   - admin 또는 isSubscribed: 전체 허용
 *   - 일반 사용자:
 *       · disabled에 포함된 메뉴 → 차단(리다이렉트)
 *       · paid에 포함된 메뉴   → 차단(리다이렉트)
 *       · 그 외 메뉴           → 허용
 *   - 정책/유저 로딩 중에는 리다이렉트 하지 않음(레이스 방지)
 */

import React, { useEffect, useMemo, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import LogoutHeader from '@/components/LogoutHeader'
import { usePathname, useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

/** 경로 → 슬러그 매핑 헬퍼 (사이드바와 동일 규칙) */
const norm = (v: string) => String(v || '').trim().toLowerCase()
function pathToSlug(pathname: string): string | null {
  // 첫 세그먼트를 메뉴 슬러그로 사용: /convert, /compare, /pdf-tool, /pattern-editor, /random, /admin
  const m = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean)
  if (m.length === 0) return null
  const first = norm('/' + m[0])
  switch (first) {
    case '/convert': return 'convert'
    case '/compare': return 'compare'
    case '/pdf-tool':
    case '/pdf': return 'pdf-tool'
    case '/pattern-editor':
    case '/pattern': return 'pattern-editor'
    case '/random': return 'random'
    case '/admin': return 'admin'
    default: return null
  }
}

type UploadPolicy = {
  navigation?: { disabled?: string[]; paid?: string[] }
}

export default function ContentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  // ── 사용자 상태(역할/구독)
  const [signedIn, setSignedIn] = useState(false)
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [userLoading, setUserLoading] = useState(true)

  useEffect(() => {
    let unsubUser: null | (() => void) = null
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setSignedIn(false)
        setRole('user')
        setIsSubscribed(false)
        setUserLoading(false)
        if (unsubUser) { unsubUser(); unsubUser = null }
        return
      }
      setSignedIn(true)
      setUserLoading(true)
      const userRef = doc(db, 'users', u.uid)
      if (unsubUser) { unsubUser(); unsubUser = null }
      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          const data = snap.exists() ? (snap.data() as any) : {}
          setRole(norm(data.role) === 'admin' ? 'admin' : 'user')
          setIsSubscribed(Boolean(data.isSubscribed))
          setUserLoading(false)
        },
        () => {
          setRole('user')
          setIsSubscribed(false)
          setUserLoading(false)
        }
      )
    })
    return () => { unsubAuth(); if (unsubUser) unsubUser() }
  }, [])

  // ── 정책 상태(비활성/유료)
  const [policyLoading, setPolicyLoading] = useState(true)
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([])
  const [paidSlugs, setPaidSlugs] = useState<string[]>([])

  useEffect(() => {
    setPolicyLoading(true)
    const ref = doc(db, 'settings', 'uploadPolicy')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {}
        const rawDisabled = data.navigation?.disabled ?? []
        const rawPaid = data.navigation?.paid ?? []
        // 슬러그 정규화
        const normalize = (s: string) => {
          const v = norm(s)
          if (v === 'pdf') return 'pdf-tool'
          if (v === 'pattern') return 'pattern-editor'
          return v
        }
        setDisabledSlugs(rawDisabled.map(normalize))
        setPaidSlugs(rawPaid.map(normalize))
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

  const canSeeAll = role === 'admin' || isSubscribed

  // ── 접근 가드: “정책/유저 로딩이 끝난 뒤”에만 판단
  useEffect(() => {
    if (userLoading || policyLoading) return

    // 비로그인은 홈으로
    if (!signedIn) {
      if (pathname !== '/') router.replace('/')
      return
    }

    // 관리자/구독자는 모두 허용
    if (canSeeAll) return

    // 일반 사용자: 현재 경로 슬러그가 비활성 or 유료라면 차단
    const slug = pathToSlug(pathname)
    if (!slug) return // 알 수 없는 경로는 일단 패스(필요시 '/'로 리다이렉트하도록 변경 가능)

    if (slug === 'admin') {
      router.replace('/convert')
      return
    }

    const isDisabled = disabledSlugs.includes(slug)
    const isPaid = paidSlugs.includes(slug)

    if (isDisabled || isPaid) {
      // 무료 메뉴가 아니면 접근 차단 → 기본 허용 페이지로 이동
      router.replace('/convert')
    }
    // 무료 메뉴(비활성/유료에 없으면) → 접근 허용
  }, [userLoading, policyLoading, signedIn, canSeeAll, pathname, router, disabledSlugs, paidSlugs])

  return (
    <div className="grid grid-cols-[16rem_1fr] min-h-[calc(100vh-0px)] overflow-visible">
      {/* 좌측 컬럼 */}
      <div className="border-r border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/20">
        <Sidebar />
      </div>

      {/* 우측 컬럼 */}
      <div className="min-w-0 flex flex-col">
        <LogoutHeader />
        <main className="flex-1 p-4 overflow-visible">
          {userLoading || policyLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">권한 확인 중…</div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
