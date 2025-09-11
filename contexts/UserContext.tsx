'use client';
/**
 * contexts/UserContext.tsx
 * - Firestore users/{uid} 문서를 읽어 role 등 상태를 컨텍스트로 제공
 * - 신규 필드 노출: uniqueId(읽기), joinedAt(읽기), subscriptionStartAt/EndAt(읽기), isSubscribed(읽기)
 * - 남은 일수(remainingDays)는 EndAt 기준으로 계산하여 파생 제공(저장은 하지 않음)
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/client'; // ✅ 기존 경로 유지
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';

type Role = 'free' | 'basic' | 'premium' | 'admin';

export interface UserContextType {
  user: FirebaseUser | null;
  role: Role;
  loading: boolean;
  // ▼ 신규 필드(읽기 전용)
  uniqueId?: string | null;
  joinedAt?: Timestamp | null;
  subscriptionStartAt?: Timestamp | null;
  subscriptionEndAt?: Timestamp | null;
  isSubscribed?: boolean;
  remainingDays?: number | null; // 파생 값
}

const UserContext = createContext<UserContextType>({
  user: null,
  role: 'free',
  loading: true,
  uniqueId: null,
  joinedAt: null,
  subscriptionStartAt: null,
  subscriptionEndAt: null,
  isSubscribed: false,
  remainingDays: null,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<Role>('free');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{
    uniqueId?: string | null;
    joinedAt?: Timestamp | null;
    subscriptionStartAt?: Timestamp | null;
    subscriptionEndAt?: Timestamp | null;
    isSubscribed?: boolean;
  }>({});

  // ✅ 남은 일수 계산(EndAt 기준)
  const remainingDays = React.useMemo(() => {
    if (!profile?.subscriptionEndAt) return null;
    const end = profile.subscriptionEndAt.toDate().getTime();
    const now = Date.now();
    const diffMs = end - now;
    const d = Math.ceil(diffMs / (1000 * 60 * 60 * 24)); // 오늘 포함해 반올림
    return d < 0 ? 0 : d;
  }, [profile?.subscriptionEndAt]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setRole('free');
        setProfile({});
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, 'users', u.uid);
        const snap = await getDoc(ref);
        const data = snap.data() ?? {};

        // role 우선순위: 명시 role → (legacy) isPaid → 기본 free
        let resolved: Role = 'free';
        const rawRole = (data?.role ?? '').toString().trim();
        if (rawRole === 'admin' || rawRole === 'premium' || rawRole === 'basic' || rawRole === 'free') {
          resolved = rawRole as Role;
        } else if (data?.isPaid === true || data?.isSubscribed === true) {
          resolved = 'premium';
        }

        setRole(resolved);
        setProfile({
          uniqueId: data?.uniqueId ?? null,
          joinedAt: data?.joinedAt ?? null,
          subscriptionStartAt: data?.subscriptionStartAt ?? null,
          subscriptionEndAt: data?.subscriptionEndAt ?? null,
          isSubscribed: data?.isSubscribed ?? false,
        });
      } catch (e) {
        console.error('[UserContext] 사용자 문서 로드 실패:', e);
        setProfile({});
        setRole('free');
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return (
    <UserContext.Provider
      value={{
        user,
        role,
        loading,
        uniqueId: profile.uniqueId ?? null,
        joinedAt: profile.joinedAt ?? null,
        subscriptionStartAt: profile.subscriptionStartAt ?? null,
        subscriptionEndAt: profile.subscriptionEndAt ?? null,
        isSubscribed: profile.isSubscribed ?? false,
        remainingDays,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextType {
  return useContext(UserContext);
}
