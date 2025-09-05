'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

// 🔻 최소 의존: 여기서 직접 auth/db 사용 (신규 파일 생성 금지)
import { auth, db } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

/**
 * 좌측 사이드바
 * - ✅ 비구독 사용자는 "Data Convert"만 노출
 * - ✅ 구독자(또는 관리자)는 전체 노출 (현 단계에서는 구독 여부만 반영)
 * - next/link 로 클라이언트 내비게이션
 * - usePathname 으로 활성 메뉴 하이라이트
 */
export default function Sidebar() {
  const pathname = usePathname();

  // 🔐 구독 여부 상태
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // 🔎 로그인/구독 상태 확인 (최소 구현: 이 컴포넌트 내부에서만 처리)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setIsSubscribed(false);
        setLoading(false);
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
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // ⚠️ 라벨/순서는 현재 프로젝트 표기 그대로 유지(영문/한글 변경 금지)
  const menuItems = [
    { href: '/convert', label: 'Data Convert', requiresSub: false },
    { href: '/compare', label: 'Compare', requiresSub: true },
    { href: '/random',  label: 'Random',  requiresSub: true },
    { href: '/admin',   label: 'Admin',   requiresSub: true },
  ];

  // ✅ 비구독자는 requiresSub=false 만 보여줌
  const visible = loading
    ? menuItems.filter(m => m.href === '/convert') // 로딩 중 깜빡임 최소화
    : menuItems.filter(m => !m.requiresSub || isSubscribed);

  return (
    <aside className="w-64 shrink-0 border-r bg-gray-50 dark:bg-gray-900 min-h-screen">
      <nav className="px-3 py-4">
        <ul className="space-y-1">
          {visible.map((m) => {
            const active = pathname === m.href; // 현재 경로와 동일하면 활성화
            return (
              <li key={m.href}>
                <Link
                  href={m.href}
                  prefetch
                  className={clsx(
                    'block px-3 py-2 rounded-md text-sm transition',
                    active
                      ? 'bg-blue-600 text-white font-semibold' // 활성 메뉴 스타일
                      : 'text-gray-900 dark:text-white hover:bg-blue-100/70 dark:hover:bg-blue-800/40'
                  )}
                >
                  {m.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
