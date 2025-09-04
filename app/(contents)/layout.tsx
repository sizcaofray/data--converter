'use client';
/**
 * (contents) 공통 레이아웃
 * - 좌측 Sidebar + 우측 본문(children) 2단 구조만 담당
 * - 디자인/스타일은 기존 체계 유지, 라우팅만 확실히 동작하게 정리
 */
import React from 'react';
import Sidebar from '@/components/Sidebar'; // ← 기존 Sidebar 그대로 사용

export default function ContentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 화면을 좌우로 나눔(좌: 메뉴, 우: 본문)
    <div className="min-h-screen w-full flex">
      {/* 좌측 메뉴 영역 */}
      <Sidebar />

      {/* 우측 본문: 여기로 각 라우트의 page.tsx가 렌더링됨 */}
      <main className="flex-1 min-w-0 overflow-auto p-4">
        {children}
      </main>
    </div>
  );
}
