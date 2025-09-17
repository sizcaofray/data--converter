'use client';
/**
 * - 상위 레이아웃/정렬/버튼 순서 변경 없음
 * - "구독/업그레이드" 버튼 **왼쪽**에 배지(남은 일수, 마지막 사용일) 인라인 추가
 * - Basic이면 버튼 라벨 '업그레이드', Premium이면 버튼 대신 상태 배지
 * - 타입 에러 해결: useUser() 값을 any로 받아 Firestore 문서 필드 안전 접근
 * - lastUsedAt가 문서에 없을 땐 authUser.metadata.lastSignInTime로 보조
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

import { useSubscribePopup } from '@/contexts/SubscribePopupContext';
import { useUser } from '@/contexts/UserContext';

// ── 날짜 유틸 (dayjs 미사용)
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

  const { open } = useSubscribePopup();

  // ✅ 타입 충돌 방지: 컨텍스트 any로 받아, 다양한 키를 유연하게 조회
  const ctx: any = (useUser?.() as any) || {};
  // 역할(plan) 추론: role → userDoc.plan → user.plan → subscription.plan …
  const role: string = String(
    ctx.role ??
      ctx.userDoc?.plan ??
      ctx.user?.plan ??
      ctx.profile?.plan ??
      ctx.subscription?.plan ??
      ''
  )
    .trim()
    .toLowerCase();

  // userDoc 후보: 프로젝트마다 저장 위치가 다를 수 있어 가장 그럴듯한 것부터 순회
  const userDoc: any =
    ctx.userDoc ??
    ctx.user ??
    ctx.profile ??
    ctx.account ??
    ctx.subscription ??
    {};

  const isBasic = role === 'basic';
  const isPremium = role === 'premium';

  // ── 구독 만료/마지막 사용일: 여러 키를 시도하고, 마지막 사용일은 auth 메타데이터로 보조
  const subscriptionEndsAt = toDateSafe(
    userDoc.subscriptionEndsAt ??
      userDoc.endsAt ??
      ctx.subscriptionEndsAt ??
      ctx.subscription?.endsAt ??
      ctx.plan?.endsAt
  );

  // lastUsedAt이 없으면 authUser.metadata.lastSignInTime 사용
  const [authLastSignIn, setAuthLastSignIn] = useState<Date | null>(null);
  useEffect(() => {
    if (authUser?.metadata?.lastSignInTime) {
      setAuthLastSignIn(toDateSafe(authUser.metadata.lastSignInTime));
    } else {
      setAuthLastSignIn(null);
    }
  }, [authUser]);

  const lastUsedAt = toDateSafe(
    userDoc.lastUsedAt ??
      userDoc.lastLoginAt ??
      userDoc.lastActiveAt ??
      ctx.lastUsedAt ??
      authLastSignIn
  );

  const daysLeft = useMemo(() => diffDays(subscriptionEndsAt), [subscriptionEndsAt]);
  const lastUsedLabel = useMemo(() => (lastUsedAt ? fmt(lastUsedAt) : null), [lastUsedAt]);

  // ── Auth 상태
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

  // ── 초기 로딩 스켈레톤(원본 유지)
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
          <button type="button" className="text-sm rounded px-3 py-1 border border-white/20 opacity-60" disabled>
            구독
          </button>
        </div>
      </header>
    );
  }

  // ── 본 렌더 (원본 구조/순서/정렬 유지)
  return (
    <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 select-none">
      <div className="shrink-0">
        <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80">
          <span className="font-semibold">Data Converter</span>
        </Link>
      </div>

      <div className="flex-1 px-4" />

      {/* ⚠️ 오른쪽 컨테이너: 구조/정렬/순서 원본 그대로 */}
      <div className="shrink-0 flex items-center gap-3">
        {/* ✨ 여기! 구독/업그레이드 버튼 **왼쪽**에 배지 2개 인라인 */}
        {authUser && daysLeft !== null && (
          <span
            className="text-xs px-2 py-0.5 rounded border border-white/20"
            title={subscriptionEndsAt ? `만료일: ${fmt(subscriptionEndsAt)}` : undefined}
          >
            남은 {daysLeft}일
          </span>
        )}
        {authUser && lastUsedLabel && (
          <span className="text-xs px-2 py-0.5 rounded border border-white/20" title="마지막 사용일">
            마지막 {lastUsedLabel}
          </span>
        )}

        {/* 구독/업그레이드 버튼 or Premium 상태 배지 (원본 자리/순서 유지) */}
        {isPremium ? (
          <span className="text-xs px-2 py-0.5 rounded border border-emerald-500/60 text-emerald-400">
            프리미엄 이용중
          </span>
        ) : (
          <button
            type="button"
            onClick={open}
            className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
          >
            {isBasic ? '업그레이드' : '구독'}
          </button>
        )}

        {/* 이메일 (원본 위치/클래스 유지) */}
        {authUser && <span className="text-xs opacity-80">{authUser.email}</span>}

        {/* 로그인/로그아웃 버튼 (원본 순서/클래스 유지) */}
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
