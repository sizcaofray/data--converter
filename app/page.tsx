'use client'

/**
 * 홈(/) 페이지 - 복원본
 * - 기존처럼: 로그인되어 있으면 자동으로 기능 페이지(예: /convert)로 이동
 * - 로그인 버튼 클릭 시 Google 로그인 → 성공 즉시 동일 경로로 이동
 * - 레이아웃: flex-1 만 사용하여 배경이 푸터까지 자연스럽게 이어짐(여분 스크롤 없음)
 * - 여기에 필요한 UI만 포함, 다른 파일/기능은 건드리지 않음
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase/firebase'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'

// 로그인 후 이동할 기본 기능 페이지 경로(이전 동작과 동일하게 맞춰주세요)
const DEFAULT_AFTER_LOGIN = '/convert'

export default function HomePage() {
  const router = useRouter()

  // 로그인 상태
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)

  // 1) 페이지 진입 시 로그인돼 있으면 즉시 기본 페이지로 이동 (이전 동작 복원)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (u) {
        // 이미 로그인된 경우: 곧장 이동
        router.replace(DEFAULT_AFTER_LOGIN)
      }
    })
    return () => unsub()
  }, [router])

  // 2) Google 로그인
  const handleLogin = async () => {
    try {
      setBusy(true)
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      // 로그인 성공 직후에도 동일하게 이동
      router.replace(DEFAULT_AFTER_LOGIN)
    } finally {
      setBusy(false)
    }
  }

  // 3) (옵션) 로그아웃 버튼 유지 — 기존 홈 로그인 박스 형태 유지용
  const handleLogout = async () => {
    try {
      setBusy(true)
      await signOut(auth)
      // 홈에 그대로 남김 (원한다면 router.replace('/') 가능)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main
      className="
        relative
        flex-1                         /* 푸터까지 자연스럽게 채움 */
        flex flex-col items-center justify-start
        px-4
      "
    >
      {/* 상단 우측 고정 로그인 박스 (기존 위치/형태 유지) */}
      <div className="absolute right-6 top-14 z-40">
        <div className="rounded-xl border border-white/15 bg-black/30 dark:bg-white/10 backdrop-blur px-4 py-3 shadow-md">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm opacity-90">{user.email}</span>
              <button
                onClick={handleLogout}
                disabled={busy}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-60"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              disabled={busy}
              className="rounded-md border border-white/20 bg-black/30 px-4 py-2 text-sm text-white hover:bg-black/40 disabled:opacity-60"
            >
              Google 계정으로 로그인
            </button>
          )}
        </div>
      </div>

      {/* ===== 홈 히어로 영역(원래 문구/스타일 유지 가능) ===== */}
      <section className="w-full max-w-5xl mx-auto pt-16 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-6">
          파일 변환 서비스
        </h1>

        <p className="text-gray-300 dark:text-gray-300 max-w-xl mx-auto leading-relaxed">
          CSV, TXT, 엑셀 등 다양한 파일 형식을
          <br />
          간편하고 빠르게 변환하세요.
        </p>

        <ul className="mt-6 text-gray-400 dark:text-gray-400 space-y-1 text-sm">
          <li>• 클라우드 기반으로 설치 없이 사용</li>
          <li>• 즉각적인 파일 변환</li>
          <li>• 드래그 앤 드롭으로 다양한 포맷 변환</li>
        </ul>
      </section>
    </main>
  )
}
