// app/(contents)/layout.tsx
'use client'

/**
 * 사이트 내부 공통 레이아웃
 *
 * 변경 사항 (스크롤 최적화):
 * ---------------------------------------------------------
 * 1) 기존에는 최상위 래퍼 div에 className="min-h-screen w-full flex ..." 였습니다.
 *    - min-h-screen 은 "이 요소는 화면 높이(100vh) 이상으로 키워라" 라는 의미입니다.
 *
 * 2) 현재 페이지 상단에는 별도의 전체 안내 바(파란 불편사항 제보 영역)가
 *    이미 한 줄 존재하고 있습니다.
 *    즉, "상단 안내 바 높이 + min-h-screen(=100vh 이상)" 이 합쳐져
 *    실제 문서 전체 높이가 화면을 약간 초과하게 됩니다.
 *
 *    그 결과:
 *     - 실제 내용은 충분히 짧아도
 *     - 브라우저 우측에 항상 전체 스크롤바가 생깁니다.
 *
 * 3) 해결:
 *    - 최상위 래퍼에서 min-h-screen 을 제거합니다.
 *    - 이제 레이아웃은 실제 콘텐츠 높이에 맞게만 늘어나므로,
 *      내용이 화면보다 짧을 때는 스크롤바가 나타나지 않습니다.
 *    - 내용이 정말 길어질 경우에는 정상적으로 body 전체에 스크롤이 생깁니다.
 *
 * 4) overflow-auto 는 여전히 main에서 제거된 상태를 유지합니다.
 */

import React, { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import LogoutHeader from '@/components/LogoutHeader'
import { usePathname, useRouter } from 'next/navigation'

import { auth, db } from '@/lib/firebase/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

export default function ContentsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  // 로그인 및 권한 상태
  const [loading, setLoading] = useState(true)             // 권한 확인 중인지 여부
  const [signedIn, setSignedIn] = useState(false)          // 로그인 여부
  const [isSubscribed, setIsSubscribed] = useState(false)  // 유료 구독 여부
  const [role, setRole] = useState<'admin' | 'user' | undefined>() // Firestore users/{uid}.role

  useEffect(() => {
    let unsubUser: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u)

      if (!u) {
        // 로그아웃 상태
        setIsSubscribed(false)
        setRole(undefined)
        setLoading(false)
        if (unsubUser) { unsubUser(); unsubUser = null }
        return
      }

      // 로그인 상태: Firestore users/{uid} 문서 구독
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
          // 에러 시 기본값
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

  // admin(또는 구독자)이면 전체 페이지 접근 가능
  const canSeeAll = role === 'admin' || isSubscribed

  // 비구독(일반 user)도 접근 허용하는 경로
  const FREE_ALLOW = ['/convert']

  // 라우팅 가드
  useEffect(() => {
    if (loading) return

    // 로그인 안 한 경우: '/' 로 보냄
    if (!signedIn) {
      if (pathname !== '/') {
        router.replace('/')
      }
      return
    }

    // 로그인은 했지만 구독/권한이 없는 경우
    if (!canSeeAll) {
      const allowed = FREE_ALLOW.some((p) => pathname.startsWith(p))
      if (!allowed) {
        router.replace('/convert')
      }
    }
  }, [loading, signedIn, canSeeAll, pathname, router])

  return (
    /**
     * 수정된 부분:
     * - 기존: className="min-h-screen w-full flex text-inherit"
     * - 변경: className="w-full flex text-inherit"
     *
     * min-h-screen 을 제거하여 "항상 화면보다 약간 더 큰 높이"가 강제로 만들어지는 문제를 없앱니다.
     * 이제 상단 안내 바 + 이 레이아웃 합쳐진 전체 높이가
     * 실제 컨텐츠 양에 맞게만 결정됩니다.
     */
    <div className="w-full flex text-inherit">
      {/* 좌측 사이드바 (메뉴 / 역할 기반 노출) */}
      <Sidebar />

      {/* 우측 본문: 상단 바 + 실제 페이지 내용 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 상단 헤더 (로그아웃 / 이메일 / 구독버튼 등) */}
        <LogoutHeader />

        {/**
         * main 영역:
         *  - overflow-auto 제거 상태 유지
         *  - 이제 별도의 내부 스크롤 상자가 아니라,
         *    컨텐츠가 짧으면 스크롤 없음
         *    컨텐츠가 길면 문서 전체에 자연스러운 스크롤
         */
        }
        <main className="flex-1 p-4 overflow-visible">
          {loading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              권한 확인 중…
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
