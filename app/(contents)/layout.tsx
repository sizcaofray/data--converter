'use client';
/**
 * (contents) 이하 공통 레이아웃
 * - 전역 Provider(있다면)는 루트 app/layout.tsx 쪽에서 감싸세요.
 * - 여기서는 Sidebar/LogoutHeader 등 UI 프레임만 구성합니다.
 */

import React from "react";
import Sidebar from "@/components/Sidebar";          // ✅ default export
import LogoutHeader from "@/components/LogoutHeader"; // ✅ default export

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
        {/* 상단 헤더(로그아웃/구독 버튼 등) */}
        <LogoutHeader />

        {/* 페이지 컨텐츠 */}
        <main className="flex-1 p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
