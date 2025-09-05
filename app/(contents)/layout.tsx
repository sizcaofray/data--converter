'use client';
/**
 * app/(contents)/layout.tsx
 * 기존 구조 유지 + 상단바(LogoutHeader) 유지
 * ✅ 추가: 비구독 사용자의 라우팅 가드 (허용 경로: /convert)
 */

import React, { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import LogoutHeader from '@/components/LogoutHeader';

import { usePathname, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function ContentsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // 🔐 구독 여부 상태(가드 전용)
  const [guardLoading, setGuardLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const FREE_ALLOW = ['/convert']; // ✅ 비구독 허용 경로

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setIsSubscribed(false);
        setGuardLoading(false);
        return;
      }
      try {
        const ref = doc(db, 'users', u.uid);
        const snap = await getDoc(ref);
        const data = snap.exists() ? (snap.data() as any) : {};
        setIsSubscribed(!!data.isSubscribed);
      } catch {
        setIsSubscribed(false);
      } finally {
        setGuardLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (guardLoading) return;
    // ✅ 비구독이면 허용 경로 외 접근 시 /convert 로 교정
    if (!isSubscribed) {
      const allowed = FREE_ALLOW.some((p) => pathname.startsWith(p));
      if (!allowed) router.replace('/convert');
    }
  }, [guardLoading, isSubscribed, pathname, router]);

  return (
    <div className="min-h-screen w-full flex">
      {/* 좌측 메뉴 */}
      <Sidebar />
      {/* 우측: 상단바 + 본문 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <LogoutHeader />
        <main className="flex-1 overflow-auto p-4">
          {/* 로딩 중엔 깜빡임 줄이기 */}
          {guardLoading ? <div className="text-sm text-gray-500">권한 확인 중…</div> : children}
        </main>
      </div>
    </div>
  );
}
