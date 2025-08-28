// 📄 components/Sidebar.tsx
'use client';

import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { usePathname } from 'next/navigation'; // 현재 경로 확인용
import clsx from 'clsx'; // 조건부 클래스 적용

export default function Sidebar() {
  const { role, loading } = useUser();
  const pathname = usePathname(); // 현재 경로 가져오기

  // 메뉴 구성
  const menuItems = [
    { href: '/convert', label: 'Data Convert' },
    { href: '/compare', label: 'Data Compare' },
    { href: '/random', label: 'Data Randomizer' },
  ];

  return (
    <aside className="w-64 bg-gray-100 dark:bg-gray-800 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">🛠️ Data Tools</h2>

      <ul className="space-y-2">
        {/* 관리자 메뉴 (role이 admin일 때만 표시) */}
        {!loading && role === 'admin' && (
          <li>
            <Link
              href="/admin"
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

        {/* 일반 메뉴들 (현재 경로와 비교하여 강조 처리) */}
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
