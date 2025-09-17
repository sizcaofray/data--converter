'use client';
/**
 * 요구사항
 * - 레이아웃/정렬/버튼 순서 변경 없음
 * - 구독/업그레이드 버튼 "왼쪽"에 배지 2개 인라인:
 *    1) 만료: YYYY-MM-DD N일  (N = 남은 일수, 마지막날 24:00까지 포함)
 *    2) 마지막 사용일: YYYY-MM-DD  (문구 '마지막' 제거)
 * - N일이 항상 숫자로 나오도록 보장 (NaN/음수 방지: 최소 0일)
 * - 기간 만료 시 Firestore의 users/{uid}.plan 을 'basic' 으로 다운그레이드 (실패해도 UI는 Basic 처리)
 * - 타입 충돌 방지: useUser() 컨텍스트는 any로 받아 Firestore 문서 필드 접근
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
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

import { db } from '@/lib/firebase/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

// ── 날짜 유틸
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmtDate = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const endOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate(), 23, 59, 59, 999);
const toDateSafe = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) {
    const d = v.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/** 마지막날 24:00까지 포함, 항상 "정수 일수"를 반환(최소 0일). NaN/음수 방지 */
const remainingDaysInclusive = (end: Date | null | undefined): number => {
  if (!end) return 0;
  const now = new Date();
  const until = endOfDay(end);
  const dayMs = 24 * 60 * 60 * 1000;
  const ms = until.getTime() - now.getTime();
  if (!Number.isFinite(ms)) return 0;
  // 오늘이 만료일이면 1일, 이미 지났으면 0일, 그 외는 올림
  const days = Math.ceil(ms / dayMs);
  return Math.max(days, 0);
};

export default function LogoutHeader() {
  const router = useRouter();
  const [init, setInit] = useState(true);
  const [authUser, setAuthUser] = useState<any>(null);

  const { open } = useSubscribePopup();

  // 컨텍스트 any로 받아 Firestore 문서 필드 접근 (프로젝트별 키 차이 대응)
  const ctx: any = (useUser?.() as any) || {};
  const roleFromCtx: string = String(
    ctx.role ??
      ctx.userDoc?.plan ??
      ctx.user?.plan ??
      ctx.profile?.plan ??
      ctx.subscription?.plan ??
      ''
  )
    .trim()
    .toLowerCase();

  const userDoc: any =
    ctx.userDoc ??
    ctx.user ??
    ctx.profile ??
    ctx.account ??
    ctx.subscription ??
    {};

  // 만료일 / 마지막 사용일
  const subscriptionEndsAt = toDateSafe(
    userDoc.subscriptionEndsAt ??
      userDoc.endsAt ??
      ctx.subscriptionEndsAt ??
      ctx.subscription?.endsAt
  );

  // lastUsedAt 없으면 auth 메타데이터로 보조
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

  // 남은 일수(마지막날 24:00까지 포함) — 항상 숫자
  const remain = useMemo(() => remainingDaysInclusive(subscriptionEndsAt), [subscriptionEndsAt]);

  // 현재 표시용 등급 (만료 시 Basic으로 강제 표시)
  const [displayRole, setDisplayRole] = useState<'basic' | 'premium' | ''>('');
  useEffect(() => {
    if (!roleFromCtx) {
      setDisplayRole('');
      return;
    }
    if (roleFromCtx === 'premium' && remain <= 0) {
      // 만료: 표시만 먼저 Basic
      setDisplayRole('basic');
    } else {
      setDisplayRole(roleFromCtx as any);
    }
  }, [roleFromCtx, remain]);

  // Firestore 실제 다운그레이드 (중복 실행 방지)
  const downgradedRef = useRef(false);
  useEffect(() => {
    const shouldDowngrade =
      authUser?.uid && roleFromCtx === 'premium' && remain <= 0 && !downgradedRef.current;
    if (!shouldDowngrade) return;

    downgradedRef.current = true;
    const run = async () => {
      try {
        const ref = doc(db, 'users', authUser.uid);
        await updateDoc(ref, {
          plan: 'basic',
          subscriptionEndsAt: null, // 만료 처리 시점에 비움(선택)
          downgradedAt: serverTimestamp(),
        });
        setDisplayRole('basic');
      } catch (e) {
        console.warn('[subscription] downgrade failed:', e);
      }
    };
    run();
  }, [authUser?.uid, roleFromCtx, remain]);

  // Auth 상태 구독
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

  const isBasic = displayRole === 'basic';
  const isPremium = displayRole === 'premium';

  return (
    <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 select-none">
      <div className="shrink-0">
        <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80">
          <span className="font-semibold">Data Converter</span>
        </Link>
      </div>

      <div className="flex-1 px-4" />

      {/* ⚠️ 원본 컨테이너/정렬/버튼 순서 그대로 */}
      <div className="shrink-0 flex items-center gap-3">
        {/* ✨ 구독/업그레이드 버튼 왼쪽 배지들 */}
        {authUser && subscriptionEndsAt && (
          <span className="text-xs px-2 py-0.5 rounded border border-white/20" title="마지막날 24:00까지 사용 가능">
            {/* 만료일: 날짜 + 공백 + N일 (N 보장) */}
            {`${fmtDate(subscriptionEndsAt)} ${remain}일`}
          </span>
        )}
        {authUser && lastUsedAt && (
          <span className="text-xs px-2 py-0.5 rounded border border-white/20" title="마지막 사용일">
            {/* '마지막' 문구 제거 → 날짜만 */}
            {fmtDate(lastUsedAt)}
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
