'use client';
/**
 * app/(contents)/layout.tsx
 * 기존 구조 유지 + 상단바(LogoutHeader) 복원
 * - 좌: Sidebar / 우: (상단바 + 본문)
 * - 새 파일 생성 없이, 기존 LogoutHeader 컴포넌트를 그대로 사용합니다.
 */
import React from 'react';
import Sidebar from '@/components/Sidebar';
import LogoutHeader from '@/components/LogoutHeader';

export default function ContentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex">
      {/* 좌측 메뉴 */}
      <Sidebar />
      {/* 우측: 상단바 + 본문 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 🔙 복원된 상단바: 로그인/로그아웃 + 구독 버튼 포함 */}
        <LogoutHeader />
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
