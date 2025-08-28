// 📄 components/LayoutEffectWrapper.tsx

'use client';

import { useEffect } from 'react';
import { auth } from '@/lib/firebase/firebase'; // 경로 주의
import { onAuthStateChanged, signOut } from 'firebase/auth';

const LayoutEffectWrapper = () => {
  useEffect(() => {
    // ✅ 클라이언트에서 서버 세션 키를 fetch
    fetch('/api/server-session-key')
      .then(res => res.text())
      .then(serverKey => {
        const clientKey = localStorage.getItem('serverSessionKey');

        // 서버 키와 클라이언트 키가 다르면 로그아웃
        if (clientKey && clientKey !== serverKey) {
          console.warn('[Session] 서버 키 변경 감지됨 → 로그아웃 처리');
          signOut(auth);
        }

        // 최초 저장
        localStorage.setItem('serverSessionKey', serverKey);
      });

    // ✅ 로그인 상태 모니터링 (옵션)
    onAuthStateChanged(auth, user => {
      if (user) {
        console.log('[Auth] 로그인 유지 중:', user.email);
      } else {
        console.log('[Auth] 로그인 상태 아님');
      }
    });
  }, []);

  return null;
};

export default LayoutEffectWrapper;
