'use client';
/**
 * /admin 페이지 — 공개 버전 (권한/가드/리다이렉트 전부 제거)
 * - 어떤 역할이든 접근/렌더됩니다.
 * - 이전에 RouteGuard, useUser, dynamic/revalidate 등을 사용하셨다면 모두 제거합니다.
 */

import React from 'react';

export default function AdminPage() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">관리자 페이지</h1>
      <p className="mt-1 text-sm text-gray-500">
        누구에게나 표시됩니다. (권한 검사/가드 제거됨)
      </p>

      {/* 필요한 관리자 기능을 여기에 배치하세요 */}
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h2 className="font-semibold">설정</h2>
          <p className="text-sm text-gray-600">서비스 환경 설정 관리</p>
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="font-semibold">데이터</h2>
          <p className="text-sm text-gray-600">업로드/정합성/로그 확인</p>
        </div>
      </section>
    </main>
  );
}
