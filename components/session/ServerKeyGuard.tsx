'use client';

import { useEffect } from 'react';

const KEY_STORAGE = 'serverKeyDigest';

export default function ServerKeyGuard() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/server-session-key', { cache: 'no-store' });

        // ❗ 실패(500/네트워크 오류)는 "키 변경"이 아님 — 그냥 경고만 남기고 종료
        if (!res.ok) {
          console.warn('[Session] 서버 키 확인 실패:', res.status);
          return;
        }

        const { ok, digest } = await res.json();
        if (!ok || !digest) return;

        const prev = localStorage.getItem(KEY_STORAGE);
        if (prev && prev !== digest) {
          console.warn('[Session] 서버 키 변경 감지 → 로그아웃 처리');

          try {
            // ---- 여러분 프로젝트에 맞는 로그아웃 한 줄만 선택 ----

            // (A) Firebase Auth 쓰는 경우:
            const m = await import('@/lib/firebase');
            if (typeof m.signOutUser === 'function') {
              await m.signOutUser();
            }

            // (B) NextAuth 쓰는 경우(위 A 대신 사용):
            // const { signOut } = await import('next-auth/react');
            // await signOut({ callbackUrl: '/' });

          } finally {
            localStorage.setItem(KEY_STORAGE, digest);
          }
          return;
        }

        // 첫 저장 또는 동일 digest면 저장만
        localStorage.setItem(KEY_STORAGE, digest);
      } catch (e) {
        console.warn('[Session] 서버 키 확인 네트워크 오류:', e);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return null;
}
