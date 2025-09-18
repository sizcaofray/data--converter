'use client';
/**
 * LogoutHeader.tsx
 * - 디자인/마크업/클래스 변경 없음 (로직만 조정)
 * - 날짜 없거나 남은 일수 계산 불가여도 '일'은 항상 표시(로그인 시)
 * - 만료일 키 불일치 폴백, 디버그 로그, 만료 시 basic 강등 로직 유지
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

// === 디버그 로그 스위치 =========================================================
const DEBUG = true;

// ── 날짜 유틸
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmtDate = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

/**
 * ✅ 남은 '일' 계산 (마지막날 24:00까지 포함)
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
  const [authLastSignIn, setAuthLastSignIn] = useState<Date | null>(null);

  useEffect(() => {
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
  const rawEnd =
    coalesce(
      userDoc.subscriptionEndAt,
      userDoc.subscriptionEndsAt,
      userDoc.endAt,
      userDoc.endsAt,
      userDoc.endDate,
      userDoc.end_date,
      userCtx.subscriptionEndAt,
      userCtx.subscriptionEndsAt,
      userCtx.endAt,
      userCtx.endsAt,
      userCtx.endDate,
      userCtx.end_date,
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

  // ❗남은 일수: 날짜가 없으면 계산 자체를 하지 않고 null로 둠 → '일'만 표기
  const remainNum: number | null = useMemo(
    () => (subscriptionEndsAt ? remainingDaysInclusive(subscriptionEndsAt) : null),
    [subscriptionEndsAt]
  );

  // 현재 표시용 등급 (만료 시 Basic으로 강제 표시)
  const [displayRole, setDisplayRole] = useState<'basic' | 'premium' | ''>('');
  useEffect(() => {
    if (!roleFromCtx) {
      setDisplayRole('');
      return;
    }
    if (roleFromCtx === 'premium') {
      if (subscriptionEndsAt && remainingDaysInclusive(subscriptionEndsAt) <= 0) {
        setDisplayRole('basic');
      } else {
        setDisplayRole('premium');
      }
    } else {
      setDisplayRole(roleFromCtx as any);
    }
  }, [roleFromCtx, subscriptionEndsAt]);

  // Firestore 실제 다운그레이드 (중복 실행 방지)
  const downgradedRef = useRef(false);
  useEffect(() => {
    if (downgradedRef.current) return;
    if (displayRole !== 'basic') return;
    if (!authUser?.uid) return;
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
  }, [authUser?.uid, roleFromCtx, displayRole, subscriptionEndsAt]);

  // ── 콘솔 디버그
  if (DEBUG) {
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
    console.log(
      '🧮 [LogoutHeader:DEBUG]',
      'rawEnd=', rawEnd,
      '| parsed=', subscriptionEndsAt ? subscriptionEndsAt.toString() : null,
      '| remainNum=', remainNum
    );
  }

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
        {/**
         * ✅ 변경 핵심:
         * - 이전: authUser && subscriptionEndsAt 가 둘 다 있어야 배지 렌더 → 아무것도 안 보일 수 있었음
         * - 현재: authUser 만 있으면 배지 렌더
         *    - 날짜가 있으면: "YYYY-MM-DD {남은일수}일"
         *    - 날짜가 없으면: "일" 만 표기 (숫자 생략)
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
            {subscriptionEndsAt ? `${fmtDate(subscriptionEndsAt)} ` : ''}
            {Number.isFinite(remainNum as number) && subscriptionEndsAt
              ? `${remainNum}일`
              : '일' /* ← 날짜 없거나 계산 불가여도 최소 '일'은 보이게 */}
          </span>
        )}

        {authUser && lastUsedAt && (
          <span className="text-xs px-2 py-0.5 rounded border border-white/20" title="마지막 사용일">
            {fmtDate(lastUsedAt)}
          </span>
        )}

        {/* 구독/업그레이드 버튼 or Premium 상태 배지 */}
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

        {/* 이메일 */}
        {authUser?.email && <span className="text-sm opacity-80">{authUser.email}</span>}

        {/* 로그인/로그아웃 */}
        {!authUser ? (
          <button type="button" onClick={onLogin} className="text-sm rounded px-3 py-1 bg-white/10 hover:bg白/20">
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
