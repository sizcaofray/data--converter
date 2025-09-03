'use client';
/**
 * (contents) 이하 공통 레이아웃
 * - 전역 Provider는 app/layout.tsx 에서 한 번만 감쌉니다.
 * - 이 레이아웃은 UI 프레임만 제공합니다.
 */
import React from 'react';
import Sidebar from '@/components/Sidebar';
import LogoutHeader from '@/components/LogoutHeader';

export default function ContentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex">
      {/* 좌측 메뉴 */}
      <Sidebar />

      {/* 우측 본문 */}
      <div className="flex-1 flex flex-col">
        {/* 상단 헤더 */}
        <LogoutHeader />

        {/* 페이지 컨텐츠 */}
        <main className="flex-1 p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
