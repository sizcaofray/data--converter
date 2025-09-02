'use client';

import { useEffect } from 'react';

const KEY_STORAGE = 'serverKeyDigest';
const DONE_SENTINEL = 'serverKeyLogoutDone'; // 마지막으로 처리한 digest 기억

export default function ServerKeyGuard() {
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/server-session-key', { cache: 'no-store' });

        // 실패는 "키 변경"이 아님 — 로그만 남기고 종료
        if (!res.ok) {
          console.warn('[Session] 서버 키 확인 실패:', res.status);
          return;
        }

        const { ok, digest } = await res.json();
        if (!ok || !digest) return;

        const prev = localStorage.getItem(KEY_STORAGE);
        const doneFor = localStorage.getItem(DONE_SENTINEL);

        // digest 동일 → 아무 것도 안 함
        if (prev === digest) return;

        // digest가 바뀌었지만, 같은 digest에 대해 이미 처리했다면 또 하지 않음
        if (doneFor === digest) {
          localStorage.setItem(KEY_STORAGE, digest); // 동기화만
          return;
        }

        // 여기서부터가 "진짜 변경"인 경우
        console.warn('[Session] 서버 키 변경 감지됨 → 로그아웃 처리');

        // ✅ 먼저 저장(리다이렉트/언마운트 전에 반드시 기록)
        localStorage.setItem(KEY_STORAGE, digest);
        localStorage.setItem(DONE_SENTINEL, digest);

        // ---- 프로젝트에 맞는 로그아웃 한 줄만 선택 ----
        // (A) Firebase Auth만 사용하는 경우
        try {
          const m = await import('@/lib/firebase');
          if (typeof m.signOutUser === 'function') {
            await m.signOutUser();
          }
        } catch (_) { /* no-op */ }

        // (B) NextAuth를 사용한다면 위 대신 아래 사용
        // const { signOut } = await import('next-auth/react');
        // await signOut({ callbackUrl: '/' });

      } catch (e) {
        console.warn('[Session] 서버 키 확인 네트워크 오류:', e);
      }
    })();
  }, []);

  return null;
}
