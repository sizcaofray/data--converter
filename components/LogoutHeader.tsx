'use client';
/**
 * components/LogoutHeader.tsx
 * -----------------------------------------------------------------------------
 * ✅ 표시 규칙
 *  - 만료일 있음: "YYYY-MM-DD N일" (마지막날 24:00 포함)
 *  - 만료일 지남: "YYYY-MM-DD 0일"
 *  - 만료일 없음:  "0일"
 *  - lastUsedAt 배지는 별도 표기(혼동 방지 title)
 *
 * ✅ 방어/디버깅
 *  - 다양한 만료일 키 폴백 + 컨텍스트에 없으면 Firestore에서 1회 조회
 *  - DEBUG 로그로 어떤 키가 잡혔는지/최종 badgeText 확인
 *  - 디자인/마크업/클래스 변경 없음
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
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';

// Contexts (프로젝트에 존재한다고 가정)
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';
import { useUser } from '@/contexts/UserContext';

// ─────────────────────────────────────────────────────────────────────────────
const DEBUG = true; // 배포 시 false 권장
// ─────────────────────────────────────────────────────────────────────────────

// 날짜 유틸
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmtDate = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

/** 마지막날 24:00까지 포함한 "남은 일수" 계산 (최소 0) */
const remainingDaysInclusive = (end: Date | null | undefined): number => {
  if (!end) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const endNextDayStart = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, 0, 0, 0, 0);
  const ms = endNextDayStart.getTime() - todayStart.getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(Math.ceil(ms / dayMs), 0);
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

const coalesce = (...vals: any[]) => vals.find((x) => x !== undefined && x !== null);

/** 만료일 후보 키(확장) */
const END_KEYS = [
  'subscriptionEndAt',
  'subscriptionEndsAt',
  'subscriptionEndDate',
  'endAt',
  'endsAt',
  'endDate',
  'end_date',
  'expiresAt',
  'expiryAt',
  'expiredAt',
  'validUntil',
  'validTill',
  'paidUntil',
  'paidUntilAt',
  'subEndAt',
  'subEndsAt',
  'subEndDate',
  'billingEndAt',
  'billingEndsAt',
  'billingEndDate',
] as const;

const pickEndRaw = (obj: any | null | undefined): any => {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of END_KEYS) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  // 흔한 중첩
  const nested = obj.subscription || obj.billing || obj.plan || {};
  for (const k of END_KEYS) {
    if (nested[k] !== undefined && nested[k] !== null) return nested[k];
  }
  return null;
};

export default function LogoutHeader() {
  const router = useRouter();

  // 구독 팝업 컨텍스트(미마운트 방어)
  let popupCtx: any = null;
  try {
    popupCtx = (useSubscribePopup as any)?.();
  } catch {
    popupCtx = null;
  }
  const open = popupCtx?.open ?? (() => {});
  const popupAvailable = !!popupCtx?.open;

  // 유저 컨텍스트(미마운트 방어)
  let userCtx: any = {};
  try {
    userCtx = (useUser as any)?.() ?? {};
  } catch {
    userCtx = {};
  }

  // Auth
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authLastSignIn, setAuthLastSignIn] = useState<Date | null>(null);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => null);
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setAuthLastSignIn(u?.metadata?.lastSignInTime ? toDateSafe(u.metadata.lastSignInTime) : null);
    });
    return () => unsub();
  }, []);

  // 역할(plan)
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

  // 컨텍스트에서 사용자 문서 후보
  const userDoc: any =
    userCtx.userDoc ??
    userCtx.user ??
    userCtx.profile ??
    userCtx.account ??
    userCtx.subscription ??
    {};

  // 1차: 컨텍스트에서 만료일 후보
  const rawEndFromCtx = coalesce(pickEndRaw(userDoc), pickEndRaw(userCtx));

  // 2차: 없으면 Firestore에서 한번 조회
  const [extraEndRaw, setExtraEndRaw] = useState<any>(null);
  const [fetchedUserData, setFetchedUserData] = useState<any>(null);
  useEffect(() => {
    if (!authUser?.uid) return;
    if (rawEndFromCtx !== null && rawEndFromCtx !== undefined) return;
    let cancel = false;
    (async () => {
      try {
        const ref = doc(db, 'users', authUser.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const data = snap.data();
        if (cancel) return;
        setFetchedUserData(data);
        const found = pickEndRaw(data);
        setExtraEndRaw(found ?? null);
        if (DEBUG) {
          console.log('📥 [LogoutHeader] fetched user doc:', data);
          console.log('🔎 [LogoutHeader] end candidate from fetched doc:', found);
        }
      } catch (e) {
        console.warn('[LogoutHeader] fetch user doc failed:', e);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [authUser?.uid, rawEndFromCtx]);

  // 최종 만료일 원시값 → Date
  const rawEnd = coalesce(rawEndFromCtx, extraEndRaw);
  const subscriptionEndsAt: Date | null = toDateSafe(rawEnd);

  // 마지막 사용일(없으면 auth 메타 보조)
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

  // ✅ 남은 일수: 만료일 없으면 0, 있으면 계산값을 쓰되 0 미만이면 0으로 보정
  const remainNum: number = useMemo(() => {
    if (!subscriptionEndsAt) return 0;                 // 만료일 없음 → 0
    const r = remainingDaysInclusive(subscriptionEndsAt);
    return r > 0 ? r : 0;                              // 지났으면 0
  }, [subscriptionEndsAt]);

  // ✅ 배지 텍스트: 날짜가 있으면 "YYYY-MM-DD 0일/ N일" 아니면 "0일"
  const badgeText = subscriptionEndsAt
    ? `${fmtDate(subscriptionEndsAt)} ${remainNum}일`
    : '0일';

  // 디버깅
  if (DEBUG) {
    const showKeys = (obj: any, label: string) => {
      try {
        const rows: Record<string, any> = {};
        for (const k of END_KEYS) rows[`${label}.${k}`] = obj?.[k] ?? '(n/a)';
        const nested = obj?.subscription || obj?.billing || obj?.plan || {};
        for (const k of END_KEYS) rows[`${label}.nested.${k}`] = nested?.[k] ?? '(n/a)';
        console.table(rows);
      } catch {}
    };
    showKeys(userDoc, 'doc');
    showKeys(userCtx, 'ctx');
    if (fetchedUserData) showKeys(fetchedUserData, 'fetched');

    console.log('🏷️ [LogoutHeader] badgeText =', badgeText, {
      rawEndFromCtx,
      extraEndRaw,
      parsed: subscriptionEndsAt ? subscriptionEndsAt.toString() : null,
      remainNum,
      roleFromCtx,
    });
  }

  // 표시용 등급 (만료 시 basic)
  const [displayRole, setDisplayRole] = useState<'basic' | 'premium' | ''>('');
  useEffect(() => {
    if (!roleFromCtx) {
      setDisplayRole('');
      return;
    }
    if (roleFromCtx === 'premium') {
      // 실제 만료 여부 판단은 계산값(0일 포함)이 아니라 inclusive 원값으로
      if (subscriptionEndsAt && remainingDaysInclusive(subscriptionEndsAt) <= 0) {
        setDisplayRole('basic');
      } else {
        setDisplayRole('premium');
      }
    } else {
      setDisplayRole(roleFromCtx as any);
    }
  }, [roleFromCtx, subscriptionEndsAt]);

  // Firestore 다운그레이드(중복 방지)
  const downgradedRef = useRef(false);
  useEffect(() => {
    if (downgradedRef.current) return;
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
  }, [authUser?.uid, roleFromCtx, subscriptionEndsAt]);

  // 로그인/로그아웃
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

  // 렌더
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
        {/* ✅ 구독 만료 배지: 항상 하나로 출력 */}
        {authUser && (
          <span
            className="text-xs px-2 py-0.5 rounded border border-white/20"
            title={
              subscriptionEndsAt
                ? '마지막날 24:00까지 사용 가능'
                : '만료일이 설정되지 않았습니다.'
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

        {/* 구독/업그레이드 버튼 또는 Premium 배지 */}
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

        {/* 이메일 */}
        {authUser?.email && <span className="text-sm opacity-80">{authUser.email}</span>}

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
