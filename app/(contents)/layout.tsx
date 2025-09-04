'use client';
/**
 * (contents) 공통 레이아웃
 * - 좌측 Sidebar + 우측 헤더/본문 프레임만 제공
 * - 전역 Provider는 app/layout.tsx 에서 이미 감싸고 있으므로 여기서는 UI만 책임
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
    // ✅ 화면 전체를 좌우 2단으로 나눔
    <div className="min-h-screen w-full flex">
      {/* 좌측 메뉴 */}
      <Sidebar />

      {/* 우측 본문 영역 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 상단 헤더 (로그인/로그아웃 버튼 등) */}
        <LogoutHeader />

        {/* 실제 페이지 콘텐츠가 렌더링되는 자리 */}
        <main className="flex-1 p-4 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
