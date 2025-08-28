'use client'

import {
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'

// ✅ Firebase 인증 및 DB 객체는 firebase.ts에서 직접 import
import { auth, db } from '@/lib/firebase/firebase'

import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function AuthForm() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // 🔹 Firestore에 사용자 문서가 없을 경우 기본 role로 생성
  const ensureUserDocument = async (uid: string, email: string) => {
    const userRef = doc(db, "users", uid)
    const snap = await getDoc(userRef)

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid,
        email,
        role: "free",
        createdAt: new Date().toISOString(),
      })
      console.log("✅ 사용자 문서 생성됨 (role: free)")
    } else {
      console.log("ℹ️ 사용자 문서 존재 (role:", snap.data().role, ")")
    }
  }

  // 🔹 로그인 상태 변화 감지 및 사용자 문서 확인
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserEmail(user.email)
        await ensureUserDocument(user.uid, user.email!)
      } else {
        setUserEmail(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // 🔹 Google 로그인 처리
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider()

    try {
      await setPersistence(auth, browserLocalPersistence)
      const result = await signInWithPopup(auth, provider)
      setUserEmail(result.user.email)
      await ensureUserDocument(result.user.uid, result.user.email!)
      console.log('✅ 로그인 성공:', result.user.uid)
      router.push('/convert')
    } catch (error) {
      console.error('❌ 로그인 실패:', error)
    }
  }

  // 🔹 로그아웃 처리
  const handleLogout = async () => {
    await signOut(auth)
    setUserEmail(null)
    console.log('🔓 로그아웃 완료')
    router.push('/')
  }

  // 🔹 UI 렌더링
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border dark:border-gray-700 max-w-xs">
      {loading ? (
        <p className="text-center text-gray-500">로딩 중...</p>
      ) : (
        <>
          <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100 text-center">
            {userEmail ? `환영합니다, ${userEmail}` : '로그인'}
          </h2>
          {userEmail ? (
            <button
              onClick={handleLogout}
              className="w-full bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              로그아웃
            </button>
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
