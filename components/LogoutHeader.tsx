'use client';

/**
 * LogoutHeader.tsx
 * - 기존 구조 유지: 구독 버튼 + 로그인/로그아웃 전환, role 분기(다른 컴포넌트) 유지
 * - 보완점:
 *   1) redirect 폴백 후 돌아왔을 때 getRedirectResult 처리
 *   2) onAuthStateChanged에서 user가 생기면 /convert로 이동
 */

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';

// ✅ 프로젝트의 클라이언트 Firebase 진입점
import { auth, completeRedirectSignIn } from '@/lib/firebase';

// ✅ 기존 구독 팝업 훅
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';

export default function LogoutHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { open } = useSubscribePopup();

  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  // 1) 최초 진입 시: redirect 결과 있으면 처리하고 /convert로 이동
  useEffect(() => {
    (async () => {
      try {
        const justSignedIn = await completeRedirectSignIn();
        if (justSignedIn) {
          // 리다이렉트 플로우로 방금 로그인된 경우
          if (pathname !== '/convert') router.replace('/convert');
        }
      } finally {
        // 이어서 onAuthStateChanged에서 최종 상태 반영
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 최초 1회

  // 2) 로그인 상태 구독: user가 생기면 /convert로 이동 (팝업/리다이렉트 모두 커버)
  useEffect(() => {
    if (!auth) {
      console.warn('[LogoutHeader] firebase auth가 정의되지 않았습니다.');
      setChecking(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
      if (u && pathname !== '/convert') {
        router.replace('/convert');
      }
    });
    return () => unsub();
  }, [pathname, router]);

  // 3) 구글 로그인: 팝업 → 차단/닫힘 시 redirect 폴백
  const handleLogin = useCallback(async () => {
    if (!auth) return alert('인증 모듈 초기화 실패. 환경변수/초기화 코드를 확인하세요.');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // 팝업 성공: 여기서도 즉시 이동(이중 안전)
      router.replace('/convert');
    } catch (e: any) {
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, provider);
          // redirect는 페이지가 이동되므로 여기선 추가 동작 불필요
          return;
        } catch (e2: any) {
          console.error('[LogoutHeader] signInWithRedirect error:', e2);
          alert('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
      } else {
        console.error('[LogoutHeader] signInWithPopup error:', e);
        // 도메인 미승인 등 빈번 오류 안내
        if (e?.code === 'auth/unauthorized-domain') {
          alert('로그인이 차단되었습니다. Firebase Authentication > Authorized domains에 현재 도메인을 추가하세요.');
        } else {
          alert('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
      }
    }
  }, [router]);

  const handleLogout = useCallback(async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      router.push('/');
    } catch (e) {
      console.error('[LogoutHeader] signOut error:', e);
      alert('로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }, [router]);

  const handleOpenSubscribe = useCallback(() => {
    if (!user) {
      handleLogin(); // 미로그인 시 로그인부터
      return;
    }
    open();
  }, [user, open, handleLogin]);

  return (
    <header className="w-full flex justify-end items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white dark:bg-gray-900">
      {checking && <span className="text-sm opacity-70">로그인 상태 확인 중…</span>}

      <button
        onClick={handleOpenSubscribe}
        className="text-sm bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition-colors disabled:opacity-60"
        disabled={checking}
        aria-label="구독하기"
      >
        구독하기
      </button>

      {!checking && !user && (
        <button
          onClick={handleLogin}
          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
          aria-label="Google로 로그인"
        >
          Google 로그인
        </button>
      )}

      {!checking && user && (
        <>
          <span className="text-sm max-w-[14rem] truncate" title={user.email || undefined}>
            {user.email}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition-colors"
            aria-label="로그아웃"
          >
            로그아웃
          </button>
        </>
      )}
    </header>
  );
}
