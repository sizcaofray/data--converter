'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

/**
 * 좌측 사이드바
 * - 라우트 그룹 (contents) 하의 페이지들: /convert, /compare, /random, /admin
 * - active(현재 경로)일 때 강조
 */
export default function Sidebar() {
  const pathname = usePathname();

  // ✅ 필요 메뉴만 구성 (구독/권한은 나중에 붙임)
  const menuItems = [
    { href: '/convert', label: 'Data Convert' },
    { href: '/compare', label: 'Data Compare' },
    { href: '/random', label: 'Data Randomizer' },
    { href: '/admin', label: 'Admin' }, // 권한 적용 전까지 모두 노출
  ];

  return (
    <aside className="w-64 shrink-0 border-r bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="px-4 py-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Menu</h2>
      </div>

      <nav className="px-2 pb-6">
        <ul className="space-y-1">
          {menuItems.map((m) => {
            const isActive = pathname === m.href;
            return (
              <li key={m.href}>
                <Link
                  href={m.href}
                  prefetch
                  aria-current={isActive ? 'page' : undefined}
                  className={clsx(
                    'block px-3 py-2 rounded transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-gray-900 dark:text-white hover:bg-blue-100/70 dark:hover:bg-blue-800/50'
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
