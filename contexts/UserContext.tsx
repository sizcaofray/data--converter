// 📁 contexts/UserContext.tsx
'use client';

import {
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getDoc,
  doc,
} from 'firebase/firestore';
import { createContext, useContext, useEffect, useState } from 'react';

// 🔧 경로 수정: auth, db는 firebase.ts에 있음
import { auth, db } from '@/lib/firebase/firebase';

// 🔹 Context에서 사용할 사용자 정보 타입
interface UserContextType {
  firebaseUser: FirebaseUser | null;
  role: 'admin' | 'basic' | 'premium' | 'free' | null;
  loading: boolean;
}

// 🔹 Context 초기값
const UserContext = createContext<UserContextType>({
  firebaseUser: null,
  role: null,
  loading: true,
});

// 🔹 Provider 정의
export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<'admin' | 'basic' | 'premium' | 'free' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        // 🔎 Firestore에서 사용자 역할 정보 가져오기
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const data = userDoc.data();
        setRole((data?.role as any) || 'free'); // 역할 없으면 기본값은 free
      } else {
        setRole(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ firebaseUser, role, loading }}>
      {children}
    </UserContext.Provider>
  );
};

// 🔹 Context를 사용하는 훅
export const useUser = () => useContext(UserContext);
