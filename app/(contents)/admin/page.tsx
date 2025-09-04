'use client';
/**
 * app/(contents)/admin/page.tsx
 * 목적: 좌측 메뉴 클릭 시 우측 프레임에 즉시 렌더 + 권한은 "리다이렉트 대신 UI"로 차단
 * - 기존 기능/컴포넌트는 건드리지 않음 (권한 미충족 시에도 SPA 전환은 유지)
 * - Firebase Auth + Firestore의 users/{uid}.role을 읽어 'admin'만 본문 표시
 */

import React, { useEffect, useState } from 'react';
import { app } from '@/lib/firebase/firebase';               // ← 프로젝트의 Firebase 초기화 파일
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

type Role = 'guest' | 'user' | 'paid' | 'admin';

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role>('guest');

  useEffect(() => {
    const auth = getAuth(app);
    const db = getFirestore(app);

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          setRole('guest');            // 미로그인
          return;
        }
        const ref = doc(db, 'users', user.uid);
        const snap = await getDoc(ref);
        const r = (snap.exists() && snap.data()?.role) as Role | undefined;
        setRole(r ?? 'user');          // 문서 없으면 기본 'user'
      } catch {
        setRole('guest');              // 에러 시 최소 권한
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // 1) 로딩 상태
  if (loading) {
    return (
      <main className="p-6">
        <div className="text-sm text-gray-500">권한 확인 중…</div>
      </main>
    );
  }

  // 2) 미로그인
  if (role === 'guest') {
    return (
      <main className="p-6">
        <h1 className="text-xl font-bold">로그인이 필요합니다</h1>
        <p className="mt-1 text-sm text-gray-500">
          좌측 메뉴는 정상 동작합니다. 로그인 후 관리자 페이지를 이용해 주세요.
        </p>
      </main>
    );
  }

  // 3) 로그인했지만 관리자 아님
  if (role !== 'admin') {
    return (
      <main className="p-6">
        <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
        <p className="mt-1 text-sm text-gray-500">
          이 페이지는 관리자에게만 열려 있습니다.
        </p>
      </main>
    );
  }

  // 4) 관리자에게만 본문 표시 (기존 관리자 UI/컴포넌트는 아래에 그대로 두세요)
  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">관리자 페이지</h1>
      <p className="mt-1 text-sm text-gray-500">
        관리자 권한 확인 완료.
      </p>

      {/* ⬇ 기존의 관리자 기능 컴포넌트/콘텐츠를 이 아래에 그대로 유지하세요. */}
      <section className="mt-6 space-y-4">
        <div className="rounded-xl border p-4">
          <h2 className="font-semibold">설정</h2>
          <p className="text-sm text-gray-600">서비스 환경 설정을 관리합니다.</p>
        </div>
        <div className="rounded-xl border p-4">
          <h2 className="font-semibold">권한 관리</h2>
          <p className="text-sm text-gray-600">
            관리자만 접근 가능한 영역입니다.
          </p>
        </div>
        {/* 예: <AdminDashboard /> / <UserLimitConfigurator /> 등 기존 컴포넌트를 그대로 배치 */}
      </section>
    </main>
  );
}
