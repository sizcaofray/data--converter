'use client';

import { useMemo } from 'react';
import { useUser } from '@/contexts/UserContext';

export default function AdminPage() {
  const { role, loading } = useUser();

  const isAdmin = useMemo(
    () => ((role ?? '') as string).trim().toLowerCase() === 'admin',
    [role]
  );

  if (loading) return <p className="p-6 text-gray-500">로딩 중...</p>;
  if (!isAdmin) return <p className="p-6 text-red-500">⛔ 관리자 권한이 없습니다.</p>;

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">관리자 페이지</h1>
      <p className="text-sm text-gray-500">환경설정/권한관리/업로드 제한 등</p>
      {/* 관리자 기능 컴포넌트 배치 */}
    </main>
  );
}
