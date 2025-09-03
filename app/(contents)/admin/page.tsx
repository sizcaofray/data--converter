'use client';
/**
 * /admin 페이지 (권한 검사 제거 버전)
 * - role/권한 체크를 완전히 없애 항상 페이지가 렌더되도록 합니다.
 * - 기존 훅(useUser 등)과 관련 로직을 모두 제거했습니다.
 */

import React from 'react';

export default function AdminPage() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">관리자 페이지</h1>
      <p className="mt-1 text-sm text-gray-500">
        누구에게나 표시됩니다. (권한 검사 제거됨)
      </p>

      {/* TODO: 관리자 기능 컴포넌트들을 여기에 배치하세요. */}
      <section className="mt-6 space-y-4">
        <div className="rounded-xl border p-4">
          <h2 className="font-semibold">설정</h2>
          <p className="text-sm text-gray-600">서비스 환경 설정을 관리합니다.</p>
        </div>
        <div className="rounded-xl border p-4">
          <h2 className="font-semibold">권한 관리(표시만)</h2>
          <p className="text-sm text-gray-600">
            현재는 권한 체크가 비활성화되어 누구나 접근 가능합니다.
          </p>
        </div>
      </section>
    </main>
  );
}
