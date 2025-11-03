'use client'

/**
 * 홈(/) 페이지
 * - 기존 로그인 박스를 새 파일 추가 없이 이 파일 안에서 복구
 * - Firebase Auth(Google) 로그인/로그아웃
 * - 상단 우측에 고정된 작은 박스로 표시 (레이아웃/배경에 영향 없음)
 * - 배경은 flex-1만 사용하여 푸터까지 자연스럽게 이어지고, 불필요한 전역 스크롤 발생 없음
 */

import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase/firebase'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'

export default function HomePage() {
  // --- 로그인 상태 관리 ---
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // 로그인 상태 실시간 구독
    const unsub = onAuthStateChanged(auth, (u) => setUser(u))
    return () => unsub()
  }, [])

  // Google 로그인
  const login = async () => {
    try {
      setBusy(true)
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } finally {
      setBusy(false)
    }
  }

  // 로그아웃
  const logout = async () => {
    try {
      setBusy(true)
      await signOut(auth)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main
      className="
        relative
        flex-1            /* 푸터를 제외한 남은 세로 공간을 꽉 채움 → 배경이 푸터까지 이어짐 */
        flex flex-col items-center justify-start
        px-4
      "
    >
      {/* 상단-우측 고정 로그인 박스 (작은 카드) */}
      <div className="absolute right-6 top-14 z-40">
        <div className="rounded-xl border border-white/15 bg-black/30 dark:bg-white/10 backdrop-blur px-4 py-3 shadow-md">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm opacity-90">{user.email}</span>
              <button
                onClick={logout}
                disabled={busy}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-60"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              disabled={busy}
              className="rounded-md border border-white/20 bg-black/30 px-4 py-2 text-sm text-white hover:bg-black/40 disabled:opacity-60"
            >
              Google 계정으로 로그인
            </button>
          )}
        </div>
      </div>

      {/* ===== 기존 메인 히어로 영역(내용은 예시, 기존 문구/스타일 유지 가능) ===== */}
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
      {/* =============================================================== */}
    </main>
  )
}
