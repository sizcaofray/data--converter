'use client';
/**
 * (contents) 이하 공통 레이아웃
 * - 전역 SubscribePopupProvider로 감싸서 하위 페이지/헤더 어디서든 useSubscribePopup 안전 보장
 * - Sidebar / LogoutHeader는 default export 기준
 */

import React from "react";
import Sidebar from "@/components/Sidebar";
import LogoutHeader from "@/components/LogoutHeader";
import SubscribePopupProvider from "@/components/subscribe/SubscribePopupProvider"; // ✅ 새로 추가

export default function ContentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SubscribePopupProvider>
      <div className="min-h-dvh flex">
        {/* 좌측 메뉴 */}
        <Sidebar />

        {/* 우측 본문 */}
        <div className="flex-1 flex flex-col">
          {/* 상단 헤더(구독 버튼/팝업 트리거 포함) */}
          <LogoutHeader />

          {/* 페이지 컨텐츠 */}
          <main className="flex-1 p-4">
            {children}
          </main>
        </div>
      </div>
    </SubscribePopupProvider>
  );
}
