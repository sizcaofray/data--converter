'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useUser } from '@/contexts/UserContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { role, loading } = useUser();

  // 역할 정규화
  const isAdmin = ((role ?? '') as string).trim().toLowerCase() === 'admin';

  const menuItems = [
    { href: '/convert', label: 'Data Convert' },
    { href: '/compare', label: 'Data Compare' },
    { href: '/random', label: 'Data Randomizer' },
  ];

  return (
    <aside className="w-64 bg-gray-100 dark:bg-gray-800 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">🛠️ Data Tools</h2>

      <ul className="space-y-2">
        {/* 관리자 메뉴: 로딩 종료 + admin 일 때만 */}
        {!loading && isAdmin && (
          <li>
            <Link
              href="/admin"  // app/(contents)/admin → URL은 /admin
              className={clsx(
                'block px-3 py-2 rounded font-semibold',
                pathname === '/admin'
                  ? 'bg-yellow-500 text-white dark:bg-yellow-600'
                  : 'bg-yellow-100 dark:bg-yellow-700 text-yellow-900 dark:text-yellow-100 hover:bg-yellow-200 dark:hover:bg-yellow-600'
              )}
            >
              Administrator
            </Link>
          </li>
        )}

        {/* 공용 메뉴 */}
        {menuItems.map((m) => (
          <li key={m.href}>
            <Link
              href={m.href}
              className={clsx(
                'block px-3 py-2 rounded',
                pathname === m.href
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'hover:bg-blue-200 dark:hover:bg-blue-700 text-gray-900 dark:text-white'
              )}
            >
              {m.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
