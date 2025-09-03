// 📄 app/(contents)/layout.tsx
import type { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';
import LogoutHeader from '@/components/LogoutHeader';

export const metadata = {
  title: 'Data Tools',
  description: 'Data Convert & Admin Tools',
};

export default function ContentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid grid-cols-[16rem_1fr] bg-white dark:bg-gray-900 text-black dark:text-white">
      {/* 왼쪽: 고정 사이드바 */}
      <Sidebar />

      {/* 오른쪽: 상단 헤더 + 라우트 컨텐츠 */}
      <div className="flex flex-col">
        <LogoutHeader />
        <main className="flex-1 p-10 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
