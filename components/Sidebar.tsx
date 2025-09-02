// 📄 components/Sidebar.tsx
'use client';

import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

export default function Sidebar() {
  const { role, loading } = useUser();
  const pathname = usePathname();

  // ✅ role 정규화: 공백/대소문자 변형을 모두 admin으로 인식
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
        {/* ✅ 관리자 메뉴: 로딩 끝 + admin일 때만 */}
        {!loading && isAdmin && (
          <li>
            <Link
              href="/admin"  // 경로 그룹(app/(contents)/admin)은 URL에 영향 없음 → /admin이 맞습니다
              className={clsx(
                'block px-3 py-2 rounded font-semibold',
                pathname === '/admin'
                  ? 'bg-yellow-400 text-white dark:bg-yellow-600'
                  : 'bg-yellow-100 dark:bg-yellow-700 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-600'
              )}
            >
              Administrator
            </Link>
          </li>
        )}

        {/* 일반 메뉴 */}
        {menuItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={clsx(
                'block px-3 py-2 rounded',
                pathname === item.href
                  ? 'bg-blue-500 text-white font-semibold'
                  : 'hover:bg-blue-200 dark:hover:bg-blue-700 text-gray-900 dark:text-white'
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
