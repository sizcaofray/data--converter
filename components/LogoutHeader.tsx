'use client';

/**
 * LogoutHeader.tsx
 * - 기존 "구독하기 + 로그아웃" UI를 유지하면서
 * - 로그인 상태 감지(onAuthStateChanged) 및 Google 로그인 버튼을 추가합니다.
 * - 팝업 차단 시 자동으로 signInWithRedirect로 폴백합니다.
 * - 로그인 성공 시 /convert로 이동(기존 요구사항 반영). 필요 없으면 router.replace('/convert') 부분만 주석 처리하세요.
 * - role 기반 메뉴 노출 로직은 기존 다른 컴포넌트(예: Sidebar)에서 그대로 유지됩니다.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';

// ✅ 프로젝트에 이미 존재하는 경로를 유지합니다. (index.ts로 통일했다면 '@/lib/firebase'로 교체하세요)
import { auth } from '@/lib/firebase/firebase';

// ✅ 구독 팝업 컨텍스트(기존 그대로 사용)
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';

export default function LogoutHeader() {
  const router = useRouter();
  const { open } = useSubscribePopup();

  // ── 로그인 상태 관리
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true); // 최초 상태 확인 로딩

  // ── 마운트 시 로그인 상태 구독
  useEffect(() => {
    // auth가 제대로 초기화되지 않았다면 콘솔 경고만 남기고 UI는 최소한으로 동작
    if (!auth) {
      console.warn('[LogoutHeader] firebase auth가 정의되지 않았습니다. ENV 및 초기화 코드를 확인하세요.');
      setChecking(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
    });

    return () => unsub();
  }, []);

  // ── Google 로그인 (팝업 → 차단 시 리다이렉트 폴백)
  const handleLogin = useCallback(async () => {
    if (!auth) return alert('인증 모듈이 초기화되지 않았습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // 로그인 성공 시 이동(원치 않으면 주석)
      router.replace('/convert');
    } catch (e: any) {
      // 팝업 차단/닫힘 → 리다이렉트 폴백
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (e2: any) {
          console.error('[LogoutHeader] signInWithRedirect error:', e2);
          alert('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
      } else {
        console.error('[LogoutHeader] signInWithPopup error:', e);
        alert('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    }
  }, [router]);

  // ── 로그아웃
  const handleLogout = useCallback(async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      router.push('/'); // 로그아웃 후 랜딩으로
    } catch (e) {
      console.error('[LogoutHeader] signOut error:', e);
      alert('로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }, [router]);

  // ── 구독 버튼: 미로그인 시 로그인 유도 → 로그인 후 사용하도록 안내
  const handleOpenSubscribe = useCallback(() => {
    if (!user) {
      // 로그인 안 되어 있으면 먼저 로그인
      handleLogin();
      return;
    }
    // 로그인되어 있으면 기존 팝업 오픈
    console.log('🟢 [LogoutHeader] 구독 버튼 클릭됨');
    open();
  }, [user, open, handleLogin]);

  return (
    <header className="w-full flex justify-end items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white dark:bg-gray-900">
      {/* 상태 표시 (초기 확인 중) */}
      {checking && (
        <span className="text-sm opacity-70">로그인 상태 확인 중…</span>
      )}

      {/* 구독 버튼 (로그인 필요 시 자동 유도) */}
      <button
        onClick={handleOpenSubscribe}
        className="text-sm bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition-colors disabled:opacity-60"
        disabled={checking}
        aria-label="구독하기"
      >
        구독하기
      </button>

      {/* 로그인/로그아웃 전환 */}
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
          {/* 사용자 정보 간단 표기 (원한다면 아바타/프로필로 확장) */}
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
