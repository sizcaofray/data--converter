'use client';
/**
 * 요구사항 & 안정화
 * - 레이아웃/정렬/버튼 순서 변경 없음
 * - 구독/업그레이드 버튼 "왼쪽"에 배지 2개 인라인:
 *    1) 만료: YYYY-MM-DD N일  (N = 남은 일수, 마지막날 24:00까지 포함)
 *    2) 마지막 사용일: YYYY-MM-DD  (문구 '마지막' 제거)
 * - N일 항상 숫자 보장 (NaN/음수 방지: 최소 0)
 * - 만료 시 Firestore plan = 'basic' 으로 다운그레이드 (실패해도 UI는 Basic 처리)
 * - 컨텍스트(useSubscribePopup, useUser) 미설정이어도 페이지가 죽지 않도록 방어
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

/**
 * ✅ 남은 '일' 계산 (마지막날 24:00까지 포함)
 *  - todayStart: 오늘 00:00
 *  - endNextDayStart: 만료일 다음날 00:00
 *  - days = ceil((endNextDayStart - todayStart) / 1day)
 *  - 결과 최소 0 보장
 */
const remainingDaysInclusive = (end: Date | null | undefined): number => {
  if (!end) return 0;
  const dayMs = 24 * 60 * 60 * 1000;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const endNextDayStart = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, 0, 0, 0, 0);

  const ms = endNextDayStart.getTime() - todayStart.getTime();
  if (!Number.isFinite(ms)) return 0;

  const days = Math.ceil(ms / dayMs);
  return Math.max(days, 0);
};

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

  // ── 구독 팝업 훅: 미설정이어도 페이지가 죽지 않도록 방어
  let popupCtx: any = null;
  try {
    popupCtx = (useSubscribePopup as any)?.();
  } catch {
    popupCtx = null;
  }
  const open = popupCtx?.open ?? (() => {}); // 없으면 no-op
  const popupAvailable = !!popupCtx?.open;

  // ── 유저 컨텍스트 훅: 미설정이어도 방어
  let userCtx: any = {};
  try {
    userCtx = (useUser as any)?.() ?? {};
  } catch {
    userCtx = {};
  }

  // 역할(plan) 파싱 (여러 키 시도)
  const roleFromCtx: string = String(
    userCtx.role ??
      userCtx.userDoc?.plan ??
      userCtx.user?.plan ??
      userCtx.profile?.plan ??
      userCtx.subscription?.plan ??
      ''
  )
    .trim()
    .toLowerCase();

  // Firestore 사용자 문서 후보 (여러 키 시도)
  const userDoc: any =
    userCtx.userDoc ??
    userCtx.user ??
    userCtx.profile ??
    userCtx.account ??
    userCtx.subscription ??
    {};

  // 만료일 / 마지막 사용일
  const subscriptionEndsAt = toDateSafe(
    userDoc.subscriptionEndsAt ??
      userDoc.endsAt ??
      userCtx.subscriptionEndsAt ??
      userCtx.subscription?.endsAt
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
      userCtx.lastUsedAt ??
      authLastSignIn
  );

  // ✅ 남은 일수(마지막날 24:00까지 포함) — 항상 숫자
  const remain = useMemo(() => remainingDaysInclusive(subscriptionEndsAt), [subscriptionEndsAt]);
  const remainText = Number.isFinite(remain) ? String(remain) : '0';

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
          subscriptionEndsAt: null,
          downgradedAt: serverTimestamp(),
        });
        setDisplayRole('basic');
      } catch (e) {
        // 다운그레이드 실패해도 화면은 Basic 유지
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

  // ── 초기 로딩 시(원본 스켈레톤 유지)
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
            {`${fmtDate(subscriptionEndsAt)} ${remainText}일`}
          </span>
        )}
        {authUser && lastUsedAt && (
          <span className="text-xs px-2 py-0.5 rounded border border-white/20" title="마지막 사용일">
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
            disabled={!popupAvailable} // 컨텍스트 없으면 비활성화(페이지는 유지)
            title={popupAvailable ? undefined : '구독 팝업 컨텍스트가 설정되지 않았습니다'}
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
