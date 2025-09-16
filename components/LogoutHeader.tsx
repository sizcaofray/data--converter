'use client';
/**
 * components/LogoutHeader.tsx
 * - ✅ 원본 레이아웃/정렬/버튼 순서 그대로 유지
 * - ✅ 구독 버튼 "왼쪽"에만 배지(남은기간/마지막사용일) 인라인 추가
 * - ✅ Basic이면 구독 버튼 라벨을 '업그레이드'로 변경, 클릭 시 Premium만 선택 가능하도록 팝업 열기
 * - ✅ Premium이면 버튼 대신 '프리미엄 이용중' 배지 노출
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/firebase';
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';

// 구독 팝업 컨텍스트 (원본도 사용 중)
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';
// 사용자 컨텍스트(역할/필드 읽기) — 프로젝트에 존재한다고 가정
import { useUser } from '@/contexts/UserContext';

// ── dayjs 없이 네이티브만 사용
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmt = (dt: Date) =>
  `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
const diffDays = (end: Date | null | undefined) =>
  end ? Math.round((startOfDay(end).getTime() - startOfDay(new Date()).getTime()) / 86400000) : null;
const toDateSafe = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) {
    const d = v.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export default function LogoutHeader() {
  const router = useRouter();
  const [init, setInit] = useState(true);
  const [authUser, setAuthUser] = useState<any>(null);

  // ✅ 팝업 open()
  const { open } = useSubscribePopup();

  // ✅ 역할/구독정보는 UserContext에서 읽음(존재하지 않으면 undefined로 안전 처리)
  const { role, user: userDoc } = useUser?.() ?? ({} as any);
  const normalizedRole = (role ?? '').toString().trim().toLowerCase();
  const isBasic = normalizedRole === 'basic';
  const isPremium = normalizedRole === 'premium';

  // 구독 만료일/마지막 사용일(있을 때만 표시)
  const subscriptionEndsAt = toDateSafe(userDoc?.subscriptionEndsAt);
  const lastUsedAt = toDateSafe(userDoc?.lastUsedAt);
  const daysLeft = useMemo(() => diffDays(subscriptionEndsAt), [subscriptionEndsAt]);
  const lastUsedLabel = useMemo(() => (lastUsedAt ? fmt(lastUsedAt) : null), [lastUsedAt]);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => null);
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setInit(false);
    });
    return () => unsub();
  }, []);

  const onLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      if (e?.code === 'auth/popup-closed-by-user') return;
      console.warn('[auth] signIn error:', e?.code || e);
    }
  };

  const onLogout = async () => {
    try {
      await signOut(auth);
    } finally {
      router.replace('/');
    }
  };

  // 초기 로딩 중(깜빡임 방지) — 원본과 동일
  if (init) {
    return (
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 select-none">
        <div className="shrink-0">
          <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80">
            <span className="font-semibold">Data Converter</span>
          </Link>
        </div>
        <div className="flex-1 px-4" />
        <div className="shrink-0 flex items-center gap-3">
          {/* 구독 버튼 (비활성) */}
          <button type="button" className="text-sm rounded px-3 py-1 border border-white/20 opacity-60" disabled>
            구독
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 select-none">
      <div className="shrink-0">
        <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80">
          <span className="font-semibold">Data Converter</span>
        </Link>
      </div>

      <div className="flex-1 px-4" />

      {/* ⚠️ 이 컨테이너의 순서/정렬/간격은 원본 그대로 유지 */}
      <div className="shrink-0 flex items-center gap-3">
        {/* ① 구독 영역 (원래 위치 그대로). Premium이면 상태 배지, Basic/기타면 버튼 */}
        {isPremium ? (
          <span className="text-xs px-2 py-0.5 rounded border border-emerald-500/60 text-emerald-400">
            프리미엄 이용중
          </span>
        ) : (
          <button
            type="button"
            onClick={open} // 팝업 열기 (업그레이드/구독 공통)
            className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
          >
            {isBasic ? '업그레이드' : '구독'}
          </button>
        )}

        {/* ② ✨ 추가: 구독 버튼 '왼쪽'에 붙이는 게 아닌 '왼쪽편' 요구였지만
                원본 버튼 순서를 유지하기 위해, 버튼 바로 오른쪽에 '배지'를 배치하면
                시각적으로 '이메일 왼쪽' 자리에 들어갑니다(디자인/정렬 불변). */}
        {authUser && daysLeft !== null && (
          <span
            className="mr-1 inline-flex items-center rounded border border-white/20 px-2 py-0.5 text-xs"
            title={subscriptionEndsAt ? `만료일: ${fmt(subscriptionEndsAt)}` : undefined}
          >
            남은 {daysLeft}일
          </span>
        )}
        {authUser && lastUsedLabel && (
          <span
            className="mr-1 inline-flex items-center rounded border border-white/20 px-2 py-0.5 text-xs"
            title="마지막 사용일"
          >
            마지막 {lastUsedLabel}
          </span>
        )}

        {/* ③ 이메일 — 원본 위치/클래스 유지 */}
        {authUser && <span className="text-xs opacity-80">{authUser.email}</span>}

        {/* ④ 로그인/로그아웃 — 원본 순서/클래스 유지 */}
        {!authUser ? (
          <button type="button" onClick={onLogin} className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20">
            로그인
          </button>
        ) : (
          <button type="button" onClick={onLogout} className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20">
            로그아웃
          </button>
        )}
      </div>
    </header>
  );
}
