'use client';
/**
 * Sidebar — 메뉴 고정 노출판
 * - ‘관리자’ 메뉴를 항상 표시하고, /admin으로 연결합니다.
 * - 역할/권한에 따른 필터링은 하지 않습니다.
 * - 필요한 경우 이 파일에 항목을 더 추가하세요.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

type NavItem = { label: string; href: string };

const NAV: NavItem[] = [
  { label: '홈',   href: '/' },
  { label: '변환', href: '/convert' },
  { label: '비교', href: '/compare' },
  { label: '관리자', href: '/admin' }, // ✅ 항상 노출
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r p-4">
      <nav className="space-y-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition-colors
                ${active
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100'}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
