'use client';
/**
 * LogoutHeader.tsx
 * - 디자인/마크업/버튼 순서/클래스 변경 없음 (로직 + 로그만 보강)
 * - 만료일 키 불일치 대응: subscriptionEndAt / subscriptionEndsAt / endAt / endsAt / end_date 등 폭넓게 폴백
 * - 남은 일수 N: 마지막날 24:00 포함 (최소 0)
 * - 만료 시 Firestore plan=basic 다운그레이드 (실패해도 UI는 basic 표시 유지)
 * - useSubscribePopup / useUser 미설정 상황 방어
 * - 상세 콘솔 로그 출력(키/타입/계산 값 확인용)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase/firebase';
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

import { useSubscribePopup } from '@/contexts/SubscribePopupContext';
import { useUser } from '@/contexts/UserContext';

// === 디버그 로그 스위치 (필요시 true, 배포 시 false 권장) =========================
const DEBUG = true;

// ── 날짜 유틸
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmtDate = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

/**
 * ✅ 남은 '일' 계산 (마지막날 24:00까지 포함)
 *  - todayStart: 오늘 00:00 (로컬 타임존, 브라우저 기준)
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
  // Firestore Timestamp
  if (v?.toDate) {
    const d = v.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  // 문자열/숫자/Date 호환
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// 여러 키 중 최초로 값이 존재하는 것을 반환
const coalesce = (...vals: any[]) => vals.find((x) => x !== undefined && x !== null);

export default function LogoutHeader() {
  const router = useRouter();

  // ── 구독 팝업 훅: 미설정이어도 페이지가 죽지 않도록 방어
  let popupCtx: any = null;
  try {
    popupCtx = (useSubscribePopup as any)?.();
  } catch {
    popupCtx = null;
  }
  const open = popupCtx?.open ?? (() => {});
  const popupAvailable = !!popupCtx?.open;

  // ── 유저 컨텍스트 훅: 미설정이어도 방어
  let userCtx: any = {};
  try {
    userCtx = (useUser as any)?.() ?? {};
  } catch {
    userCtx = {};
  }

  // Auth 상태
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [init, setInit] = useState(true);

  // Auth 메타(마지막 로그인 시간) 보조
  const [authLastSignIn, setAuthLastSignIn] = useState<Date | null>(null);
  useEffect(() => {
    if (authUser?.metadata?.lastSignInTime) {
      setAuthLastSignIn(toDateSafe(authUser.metadata.lastSignInTime));
    } else {
      setAuthLastSignIn(null);
    }
  }, [authUser]);

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

  // ── 만료일 필드 광범위 폴백
  //    흔히 쓰이는 변형들: subscriptionEndAt / subscriptionEndsAt / endAt / endsAt / end_date / endDate 등
  const rawEnd =
    coalesce(
      // 최우선: 문서 안
      userDoc.subscriptionEndAt,
      userDoc.subscriptionEndsAt,
      userDoc.endAt,
      userDoc.endsAt,
      userDoc.endDate,
      userDoc.end_date,

      // 컨텍스트 직계
      userCtx.subscriptionEndAt,
      userCtx.subscriptionEndsAt,
      userCtx.endAt,
      userCtx.endsAt,
      userCtx.endDate,
      userCtx.end_date,

      // 컨텍스트 내부 오브젝트
      userCtx.subscription?.endAt,
      userCtx.subscription?.endsAt,
      userCtx.subscription?.endDate,
      userCtx.subscription?.end_date
    ) ?? null;

  const subscriptionEndsAt = toDateSafe(rawEnd);

  // lastUsedAt 없으면 auth 메타데이터로 보조
  const lastUsedAt = toDateSafe(
    coalesce(
      userDoc.lastUsedAt,
      userDoc.lastLoginAt,
      userDoc.lastActiveAt,
      userCtx.lastUsedAt,
      userCtx.profile?.lastUsedAt,
      userCtx.activity?.lastUsedAt,
      authLastSignIn
    )
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
    if (downgradedRef.current) return;
    if (displayRole !== 'basic') return;
    if (!authUser?.uid) return;

    // roleFromCtx가 premium이었는데 remain<=0으로 basic 표시된 경우에만 시도
    if (roleFromCtx === 'premium' && remain <= 0) {
      downgradedRef.current = true;
      (async () => {
        try {
          const ref = doc(db, 'users', authUser.uid);
          await updateDoc(ref, {
            plan: 'basic',
            subscriptionEndsAt: null,
            downgradedAt: serverTimestamp(),
          });
          if (DEBUG) console.warn('⚠️ [subscription] Firestore plan downgraded → basic');
        } catch (e) {
          console.warn('[subscription] downgrade failed:', e);
        }
      })();
    }
  }, [authUser?.uid, roleFromCtx, remain, displayRole]);

  // ── 콘솔 디버그 (키/타입/계산값 전부 확인)
  if (DEBUG) {
    // 수집 가능한 만료일 관련 모든 키와 타입 프린트
    const inspect = (obj: any, keys: string[]) =>
      keys.map((k) => {
        const v = obj?.[k];
        return [k, v === undefined ? 'undefined' : v === null ? 'null' : Object.prototype.toString.call(v), v] as const;
      });

    const userDocKeys = [
      'subscriptionEndAt',
      'subscriptionEndsAt',
      'endAt',
      'endsAt',
      'endDate',
      'end_date',
      'lastUsedAt',
      'lastLoginAt',
      'lastActiveAt',
    ];
    const userCtxKeys = [
      'role',
      'subscriptionEndAt',
      'subscriptionEndsAt',
      'endAt',
      'endsAt',
      'endDate',
      'end_date',
      'lastUsedAt',
    ];

    // eslint-disable-next-line no-console
    console.log('🧪 [LogoutHeader:DEBUG] authUser=', !!authUser, 'uid=', authUser?.uid);
    // eslint-disable-next-line no-console
    console.table({
      'doc.subscriptionEndAt': userDoc?.subscriptionEndAt ?? '(n/a)',
      'doc.subscriptionEndsAt': userDoc?.subscriptionEndsAt ?? '(n/a)',
      'doc.endAt': userDoc?.endAt ?? '(n/a)',
      'doc.endsAt': userDoc?.endsAt ?? '(n/a)',
      'doc.endDate': userDoc?.endDate ?? '(n/a)',
      'doc.end_date': userDoc?.end_date ?? '(n/a)',

      'ctx.subscriptionEndAt': userCtx?.subscriptionEndAt ?? '(n/a)',
      'ctx.subscriptionEndsAt': userCtx?.subscriptionEndsAt ?? '(n/a)',
      'ctx.endAt': userCtx?.endAt ?? '(n/a)',
      'ctx.endsAt': userCtx?.endsAt ?? '(n/a)',
      'ctx.endDate': userCtx?.endDate ?? '(n/a)',
      'ctx.end_date': userCtx?.end_date ?? '(n/a)',

      'ctx.role': roleFromCtx || '(empty)',
    });

    // eslint-disable-next-line no-console
    console.log(
      '🧮 [LogoutHeader:DEBUG] rawEnd=',
      rawEnd,
      '| parsed subscriptionEndsAt=',
      subscriptionEndsAt ? subscriptionEndsAt.toString() : null,
      '| lastUsedAt=',
      lastUsedAt ? lastUsedAt.toString() : null,
      '| remain(days)=',
      remain
    );
  }

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
      router.refresh();
    } catch (e) {
      console.error('[Auth] 로그인 실패:', e);
    }
  };

  const onLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (e) {
      console.error('[Auth] 로그아웃 실패:', e);
    }
  };

  const isBasic = displayRole === 'basic';
  const isPremium = displayRole === 'premium';

  return (
    <header className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 text-white">
      {/* 좌측 로고/타이틀 (원본 유지) */}
      <div className="flex items-center gap-3">
        <Link href="/" className="text-lg font-semibold">Data Convert</Link>
      </div>

      {/* 우측 영역 (원본 순서/클래스 유지) */}
      <div className="flex items-center gap-2">
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
          <span className="text-xs px-2 py-0.5 rounded border border-emerald-500/60 text-emerald-400">프리미엄 이용중</span>
        ) : (
          <button
            type="button"
            onClick={open}
            className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
            disabled={!popupAvailable}
            title={popupAvailable ? undefined : '구독 팝업 컨텍스트가 설정되지 않았습니다'}
          >
            {isBasic ? '업그레이드' : '구독'}
          </button>
        )}

        {/* 이메일 (원본 위치/클래스 유지) */}
        {authUser?.email && <span className="text-sm opacity-80">{authUser.email}</span>}

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
