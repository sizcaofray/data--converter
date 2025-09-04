'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

/**
 * 좌측 사이드바
 * - 권한/구독 가드 임시 비활성: 메뉴는 모두 노출
 * - next/link 로 '클라이언트 내비게이션'만 사용(전체 새로고침/리다이렉트 금지)
 * - usePathname 으로 활성 메뉴 하이라이트
 */
export default function Sidebar() {
  const pathname = usePathname();

  // ⚠️ 라벨/순서는 현재 프로젝트 표기 그대로 유지(영문/한글 변경 금지)
  const menuItems = [
    { href: '/convert', label: 'Data Convert' },
    { href: '/compare', label: 'Data Compare' },
    { href: '/random',  label: 'Data Randomizer' },
    { href: '/admin',   label: 'Admin' },
  ];

  return (
    <aside className="w-64 shrink-0 border-r bg-gray-50 dark:bg-gray-900 min-h-screen">
      <nav className="px-3 py-4">
        <ul className="space-y-1">
          {menuItems.map((m) => {
            const active = pathname === m.href; // 현재 경로와 동일하면 활성화
            return (
              <li key={m.href}>
                <Link
                  href={m.href}
                  prefetch
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'block rounded px-3 py-2 transition-colors',
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
