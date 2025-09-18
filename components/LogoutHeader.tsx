'use client';
/**
 * components/LogoutHeader.tsx
 * -----------------------------------------------------------------------------
 * ✅ 목적
 *  - 로그인 우측 영역에 구독 만료일(마지막날 24:00까지)과 남은 일수(N일) 표시
 *  - 날짜가 없거나 계산 불가여도 최소 '일' 텍스트는 표시
 *  - 표시 형식: "YYYY-MM-DD N일" (숫자 없으면 "YYYY-MM-DD 일", 날짜 없으면 "일")
 *  - 구독 만료 시 UI는 basic으로 전환, Firestore의 plan도 basic으로 업데이트 시도
 *
 * ✅ 변경 원칙
 *  - 디자인/마크업/클래스는 가급적 그대로 유지 (로직, 조건, 로그만 보강)
 *  - 기존 컨텍스트/훅(useSubscribePopup, useUser) 부재 시에도 페이지가 죽지 않도록 방어
 *  - 다양한 필드명(subscriptionEndAt / subscriptionEndsAt / endAt / endsAt / endDate / end_date 등) 폴백
 *
 * ✅ 디버깅
 *  - DEBUG 스위치로 상세 로그 출력
 *  - console.table/console.log 로 어떤 키에 값이 들어왔는지와 최종 badgeText 확인
 * -----------------------------------------------------------------------------
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Firebase
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

// Contexts (프로젝트에 이미 존재한다고 가정)
// - 미제공/미마운트 상황에서도 컴포넌트를 깨지 않기 위해 try/catch로 방어
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';
import { useUser } from '@/contexts/UserContext';

// ─────────────────────────────────────────────────────────────────────────────
// 환경 스위치: 배포 시 false 권장
// ─────────────────────────────────────────────────────────────────────────────
const DEBUG = true;

// ─────────────────────────────────────────────────────────────────────────────
// 날짜/문자 유틸
// ─────────────────────────────────────────────────────────────────────────────
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmtDate = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

/**
 * ✅ 마지막날 24:00까지 포함한 "남은 일수" 계산
 *  - todayStart: 오늘 00:00
 *  - endNextDayStart: 만료일 다음날 00:00
 *  - days = ceil((endNextDayStart - todayStart) / 1day), 최소 0
 */
const remainingDaysInclusive = (end: Date | null | undefined): number => {
  if (!end) return 0;
  const dayMs = 24 * 60 * 60 * 1000;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const endNextDayStart = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate() + 1,
    0, 0, 0, 0
  );

  const ms = endNextDayStart.getTime() - todayStart.getTime();
  if (!Number.isFinite(ms)) return 0;

  const days = Math.ceil(ms / dayMs);
  return Math.max(days, 0);
};

/** 임의 값 → Date 안전 변환 (Firestore Timestamp/문자열/숫자/Date) */
const toDateSafe = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) {
    const d = v.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/** 여러 후보 중 최초의 유효값 반환 */
const coalesce = (...vals: any[]) => vals.find((x) => x !== undefined && x !== null);

export default function LogoutHeader() {
  const router = useRouter();

  // ───────────────────────────────────────────────────────────────────────────
  // Contexts: 존재하지 않아도 죽지 않게 방어
  // ───────────────────────────────────────────────────────────────────────────
  let popupCtx: any = null;
  try {
    popupCtx = (useSubscribePopup as any)?.();
  } catch {
    popupCtx = null;
  }
  const open = popupCtx?.open ?? (() => {});
  const popupAvailable = !!popupCtx?.open;

  let userCtx: any = {};
  try {
    userCtx = (useUser as any)?.() ?? {};
  } catch {
    userCtx = {};
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Firebase Auth 상태
  // ───────────────────────────────────────────────────────────────────────────
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authLastSignIn, setAuthLastSignIn] = useState<Date | null>(null);

  useEffect(() => {
    // 로컬 지속성 유지 (새로고침 시 로그인 유지)
    setPersistence(auth, browserLocalPersistence).catch(() => null);

    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      if (u?.metadata?.lastSignInTime) {
        setAuthLastSignIn(toDateSafe(u.metadata.lastSignInTime));
      } else {
        setAuthLastSignIn(null);
      }
    });
    return () => unsub();
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // 역할(plan) / 사용자 문서 파싱
  // ───────────────────────────────────────────────────────────────────────────
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

  const userDoc: any =
    userCtx.userDoc ??
    userCtx.user ??
    userCtx.profile ??
    userCtx.account ??
    userCtx.subscription ??
    {};

  // ───────────────────────────────────────────────────────────────────────────
  // 만료일 후보키(폭넓은 폴백)
  // ───────────────────────────────────────────────────────────────────────────
  const rawEnd =
    coalesce(
      // 문서 내부 필드들
      userDoc.subscriptionEndAt,
      userDoc.subscriptionEndsAt,
      userDoc.endAt,
      userDoc.endsAt,
      userDoc.endDate,
      userDoc.end_date,
      // 컨텍스트 루트
      userCtx.subscriptionEndAt,
      userCtx.subscriptionEndsAt,
      userCtx.endAt,
      userCtx.endsAt,
      userCtx.endDate,
      userCtx.end_date,
      // 컨텍스트 하위 오브젝트
      userCtx.subscription?.endAt,
      userCtx.subscription?.endsAt,
      userCtx.subscription?.endDate,
      userCtx.subscription?.end_date
    ) ?? null;

  const subscriptionEndsAt = toDateSafe(rawEnd);

  // 마지막 사용일(없으면 auth 메타데이터 보조)
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

  // ───────────────────────────────────────────────────────────────────────────
  // 남은 일수 계산 및 배지 텍스트 조합
  // ───────────────────────────────────────────────────────────────────────────
  const remainNum: number | null = useMemo(
    () => (subscriptionEndsAt ? remainingDaysInclusive(subscriptionEndsAt) : null),
    [subscriptionEndsAt]
  );

  // 배지 텍스트: 항상 "날짜 뒤에 'N일'"
  const dateLabel = subscriptionEndsAt ? fmtDate(subscriptionEndsAt) : '';
  const dayLabel  = (Number.isFinite(remainNum as number) && subscriptionEndsAt) ? `${remainNum}일` : '일';
  const badgeText = dateLabel ? `${dateLabel} ${dayLabel}` : dayLabel;

  if (DEBUG) {
    // 어떤 키에 값이 들어오는지 테이블로 확인
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
    console.log('🏷️ [LogoutHeader] badgeText =', badgeText, {
      dateLabel, dayLabel, remainNum, subscriptionEndsAt
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 표시용 등급 결정 (만료 시 basic으로)
  // ───────────────────────────────────────────────────────────────────────────
  const [displayRole, setDisplayRole] = useState<'basic' | 'premium' | ''>('');
  useEffect(() => {
    if (!roleFromCtx) {
      setDisplayRole('');
      return;
    }
    if (roleFromCtx === 'premium') {
      if (subscriptionEndsAt && remainingDaysInclusive(subscriptionEndsAt) <= 0) {
        setDisplayRole('basic'); // 만료 → 표시상 basic
      } else {
        setDisplayRole('premium');
      }
    } else {
      setDisplayRole(roleFromCtx as any);
    }
  }, [roleFromCtx, subscriptionEndsAt]);

  // Firestore 실제 다운그레이드 (중복 방지)
  const downgradedRef = useRef(false);
  useEffect(() => {
    if (downgradedRef.current) return;
    if (!authUser?.uid) return;
    // 원래 premium이었고 만료된 경우에만 실행
    if (roleFromCtx === 'premium' && subscriptionEndsAt && remainingDaysInclusive(subscriptionEndsAt) <= 0) {
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
  }, [authUser?.uid, roleFromCtx, subscriptionEndsAt]);

  // ───────────────────────────────────────────────────────────────────────────
  // 로그인/로그아웃
  // ───────────────────────────────────────────────────────────────────────────
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

  // ───────────────────────────────────────────────────────────────────────────
  // 렌더
  // ───────────────────────────────────────────────────────────────────────────
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
        {/**
         * ✅ 핵심: 로그인만 되어 있으면 배지 렌더
         *  - 날짜가 있으면: "YYYY-MM-DD N일"
         *  - 날짜가 없으면: "일" (최소 텍스트 보장)
         */}
        {authUser && (
          <span
            className="text-xs px-2 py-0.5 rounded border border-white/20"
            title={
              subscriptionEndsAt
                ? '마지막날 24:00까지 사용 가능'
                : '만료일 정보가 없습니다(관리자/결제 연동 상태 확인 필요).'
            }
          >
            {badgeText}
          </span>
        )}

        {/* 마지막 사용일(있을 때만) */}
        {authUser && lastUsedAt && (
          <span
            className="text-xs px-2 py-0.5 rounded border border-white/20"
            title="마지막 사용일"
          >
            {fmtDate(lastUsedAt)}
          </span>
        )}

        {/* 구독/업그레이드 버튼 또는 Premium 배지 (원본 위치/순서 유지) */}
        {isPremium ? (
          <span className="text-xs px-2 py-0.5 rounded border border-emerald-500/60 text-emerald-400">
            프리미엄 이용중
          </span>
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

        {/* 이메일 (있을 때만) */}
        {authUser?.email && (
          <span className="text-sm opacity-80">{authUser.email}</span>
        )}

        {/* 로그인/로그아웃 */}
        {!authUser ? (
          <button
            type="button"
            onClick={onLogin}
            className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
          >
            로그인
          </button>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
          >
            로그아웃
          </button>
        )}
      </div>
    </header>
  );
}
