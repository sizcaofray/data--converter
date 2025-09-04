'use client';
/**
 * contexts/UserContext.tsx
 * 기존 파일 구조 유지 + Firestore에서 role 동기화 복원
 * - auth 상태를 구독하고, 로그인된 사용자의 users/{uid} 문서에서 role을 읽어 컨텍스트에 반영
 * - role 미지정 시: isPaid → 'pro' / 기본 'free'
 * - 최소 변경으로 관리자 인식 실패(⛔ 관리자 권한) 문제를 해소
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';       // ✅ 기존 auth 모듈 그대로 사용
import { db } from '@/lib/firebase/firebase';       // ✅ 기존 Firestore 클라이언트 사용
import { doc, getDoc } from 'firebase/firestore';

export type UserRole = 'free' | 'pro' | 'admin';

export type UserContextType = {
  user: FirebaseUser | null;
  role: UserRole;
  loading: boolean;
};

const UserContext = createContext<UserContextType>({
  user: null,
  role: 'free',
  loading: true,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<UserRole>('free');
  const [loading, setLoading] = useState(true);

  // 🔁 Auth 상태 구독
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        // 로그아웃 상태
        setRole('free');
        setLoading(false);
        console.info('[UserContext] signed out → role=free');
        return;
      }

      // 로그인 상태 → Firestore에서 role 동기화
      try {
        const ref = doc(db, 'users', u.uid);
        const snap = await getDoc(ref);
        const data = snap.exists() ? (snap.data() as any) : null;
        const rawRole = (data?.role ?? '').toString().trim().toLowerCase();

        // 과거 isPaid 플래그 호환
        const isPaid = !!data?.isPaid;

        let nextRole: UserRole = 'free';
        if (rawRole === 'admin') nextRole = 'admin';
        else if (rawRole === 'pro') nextRole = 'pro';
        else nextRole = isPaid ? 'pro' : 'free';

        setRole(nextRole);
        console.info('[UserContext] role synced:', { uid: u.uid, email: u.email, role: nextRole, rawRole, isPaid });
      } catch (e) {
        console.warn('[UserContext] role fetch failed, fallback to free:', e);
        setRole('free');
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return (
    <UserContext.Provider value={{ user, role, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextType {
  return useContext(UserContext);
}
