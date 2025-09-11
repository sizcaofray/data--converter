'use client'

/**
 * components/AuthForm.tsx
 * - Google 로그인 성공 시 ensureUserProfile() 호출로 users/{uid} 문서 보강
 * - UI는 기존 그대로 유지 (디자인 변경 없음)
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'

import { auth, db } from '@/lib/firebase/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ensureUserProfile } from '@/lib/firebase/saveUser' // ✅ 추가: 최초 로그인 보강

export default function AuthForm() {
  // ✅ 상태: 로그인 여부/유저
  const [user, setUser] = useState<null | { uid: string; email: string | null }>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // ✅ 로그인 유지: 브라우저 로컬 저장(요구사항 준수)
    setPersistence(auth, browserLocalPersistence)

    // ✅ 인증 상태 구독
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser({ uid: u.uid, email: u.email })
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  /** ✅ Google 로그인 */
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider()
      const cred = await signInWithPopup(auth, provider)
      const { user } = cred

      // ✅ Firestore 사용자 문서 보강(고유ID/가입일 불변 생성 등)
      await ensureUserProfile({ uid: user.uid, email: user.email })

      // ✅ 로그인 후 이동: 기존 흐름 유지 (예: /convert 등)
      router.replace('/convert')
    } catch (e) {
      alert('로그인 중 오류가 발생했습니다.')
      console.error(e)
    }
  }

  /** ✅ 로그아웃 */
  const handleLogout = async () => {
    await signOut(auth)
    router.replace('/')
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="text-sm text-gray-500">로그인 상태 확인 중...</div>
      ) : (
        <>
          {user ? (
            <>
              <div className="text-sm text-gray-700 dark:text-gray-200">
                로그인: {user.email ?? '(이메일 없음)'}
              </div>
              <button
                onClick={handleLogout}
                className="w-full border px-4 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                로그아웃
              </button>
            </>
          ) : (
            <button
              onClick={handleLogin}
              className="w-full border px-4 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              Google 계정으로 로그인
            </button>
          )}
        </>
      )}
    </div>
  )
}
