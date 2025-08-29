'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

export type UserRole = 'free' | 'pro' | 'admin';

export type UserContextType = {
  user: User | null;
  role: UserRole;
  loading: boolean;
};

const UserContext = createContext<UserContextType>({
  user: null,
  role: 'free',
  loading: true,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 로그인 상태 변화 감지
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      // TODO: 서버/DB에서 사용자 role을 가져오세요.
      // (임시) 로그인만 하면 'free'로 둡니다.
      setRole('free');

      setLoading(false);
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
