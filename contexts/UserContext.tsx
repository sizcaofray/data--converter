'use client';

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';

type Role = 'free' | 'basic' | 'premium' | 'admin';

type Ctx = { user: FirebaseUser | null; role: Role; loading: boolean };
const UserCtx = createContext<Ctx>({ user: null, role: 'free', loading: true });

export default function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<Role>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let settled = false;
    const settle = () => { if (!settled) { settled = true; setLoading(false); } };

    try {
      unsub = onAuthStateChanged(auth, async (u) => {
        try {
          setUser(u ?? null);
          if (u) {
            try {
              const snap = await getDoc(doc(db, 'users', u.uid));
              setRole(((snap.data() as any)?.role as Role) || 'free');
            } catch { setRole('free'); }
          } else {
            setRole('free');
          }
        } finally { settle(); }
      });
    } catch { settle(); }

    const t = setTimeout(settle, 10000); // 최후 보정
    return () => { try { unsub?.(); } catch {} clearTimeout(t); };
  }, []);

  const value = useMemo(() => ({ user, role, loading }), [user, role, loading]);
  return <UserCtx.Provider value={value}>{children}</UserCtx.Provider>;
}

export const useUser = () => useContext(UserCtx);
