'use client';
/**
 * components/LogoutHeader.tsx
 * -----------------------------------------------------------------------------
 * ✅ 표시 규칙
 *  - 구독일:   "구독일 YYYY-MM-DD" (없으면 "구독일 미설정")
 *  - 만료일:   "만료일 YYYY-MM-DD (N일)"  // 마지막날 24:00까지 포함
 *    · 만료일 없음/지남 → "만료일 0일"
 *
 * ✅ 방어/디버깅
 *  - 다양한 키 폴백(구독일/만료일 각각) + 컨텍스트에 없으면 Firestore에서 1회 조회
 *  - DEBUG 로그로 어떤 키가 잡혔는지/최종 배지 문자열 확인
 *  - 디자인/마크업/클래스 변경 최소화(텍스트만 변경)
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

// Contexts
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
  const diff = endNextDayStart.getTime() - todayStart.getTime();
  if (!Number.isFinite(diff)) return 0;
  return Math.max(Math.ceil(diff / dayMs), 0);
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

/** 구독 시작일(구독일) 후보 키(확장) */
const START_KEYS = [
  'subscriptionStartAt',
  'subscriptionStartedAt',
  'startAt',
  'startedAt',
  'startDate',
  'start_date',
  'subStartAt',
  'subStartedAt',
  'subStartDate',
  'billingStartAt',
  'billingStartedAt',
  'billingStartDate',
  'paidAt',
  'paidDate',
  'purchasedAt',
  'activatedAt',
  'subscribedAt',
  'createdAt', // 초기 생성일을 구독 시작으로 쓰는 경우 대비
] as const;

const pickRawByKeys = (obj: any | null | undefined, keys: readonly string[]) => {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  // 흔한 중첩 컨테이너
  const nested = obj.subscription || obj.billing || obj.plan || {};
  for (const k of keys) {
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
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => null);
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u || null));
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

  // 1차: 컨텍스트에서 구독일/만료일 후보
  const rawStartFromCtx = coalesce(pickRawByKeys(userDoc, START_KEYS), pickRawByKeys(userCtx, START_KEYS));
  const rawEndFromCtx   = coalesce(pickRawByKeys(userDoc, END_KEYS),   pickRawByKeys(userCtx, END_KEYS));

  // 2차: 부족 시 Firestore에서 1회 조회(둘 다 보강)
  const [fetchedUserData, setFetchedUserData] = useState<any>(null);
  const [extraStartRaw, setExtraStartRaw] = useState<any>(null);
  const [extraEndRaw, setExtraEndRaw] = useState<any>(null);

  useEffect(() => {
    if (!authUser?.uid) return;
    if (rawStartFromCtx !== undefined && rawEndFromCtx !== undefined &&
        rawStartFromCtx !== null && rawEndFromCtx !== null) return;
    let cancel = false;
    (async () => {
      try {
        const ref = doc(db, 'users', authUser.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const data = snap.data();
        if (cancel) return;
        setFetchedUserData(data);
        if (rawStartFromCtx === null || rawStartFromCtx === undefined) {
          setExtraStartRaw(pickRawByKeys(data, START_KEYS));
        }
        if (rawEndFromCtx === null || rawEndFromCtx === undefined) {
          setExtraEndRaw(pickRawByKeys(data, END_KEYS));
        }
        if (DEBUG) {
          console.log('📥 [LogoutHeader] fetched user doc:', data);
        }
      } catch (e) {
        console.warn('[LogoutHeader] fetch user doc failed:', e);
      }
    })();
    return () => { cancel = true; };
  }, [authUser?.uid, rawStartFromCtx, rawEndFromCtx]);

  // 최종 원시값 → Date
  const rawStart = coalesce(rawStartFromCtx, extraStartRaw);
  const rawEnd   = coalesce(rawEndFromCtx,   extraEndRaw);

  const subscriptionStartAt: Date | null = toDateSafe(rawStart);
  const subscriptionEndsAt:  Date | null = toDateSafe(rawEnd);

  // ✅ 남은 일수: 만료일 없으면 0, 있으면 계산값(음수면 0)
  const remainNum: number = useMemo(() => {
    if (!subscriptionEndsAt) return 0;
    const r = remainingDaysInclusive(subscriptionEndsAt);
    return r > 0 ? r : 0;
  }, [subscriptionEndsAt]);

  // ✅ 배지 문자열 (라벨 포함)
  const startBadgeText = subscriptionStartAt
    ? `구독일 ${fmtDate(subscriptionStartAt)}`
    : '구독일 미설정';

  const endBadgeText = subscriptionEndsAt
    ? `만료일 ${fmtDate(subscriptionEndsAt)} (${remainNum}일)`
    : '만료일 0일';

  // 디버그
  if (DEBUG) {
    const showKeys = (obj: any, label: string, keys: readonly string[]) => {
      try {
        const rows: Record<string, any> = {};
        for (const k of keys) rows[`${label}.${k}`] = obj?.[k] ?? '(n/a)';
        const nested = obj?.subscription || obj?.billing || obj?.plan || {};
        for (const k of keys) rows[`${label}.nested.${k}`] = nested?.[k] ?? '(n/a)';
        console.table(rows);
      } catch {}
    };
    showKeys(userDoc, 'doc.START', START_KEYS);
    showKeys(userDoc, 'doc.END',   END_KEYS);
    showKeys(userCtx, 'ctx.START', START_KEYS);
    showKeys(userCtx, 'ctx.END',   END_KEYS);
    if (fetchedUserData) {
      showKeys(fetchedUserData, 'fetched.START', START_KEYS);
      showKeys(fetchedUserData, 'fetched.END',   END_KEYS);
    }

    console.log('🏷️ [LogoutHeader] startBadgeText =', startBadgeText, '| endBadgeText =', endBadgeText, {
      subscriptionStartAt: subscriptionStartAt ? subscriptionStartAt.toString() : null,
      subscriptionEndsAt:  subscriptionEndsAt  ? subscriptionEndsAt.toString()  : null,
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
        {/* ✅ 구독일 배지 */}
        {authUser && (
          <span
            className="text-xs px-2 py-0.5 rounded border border-white/20"
            title={subscriptionStartAt ? '구독 시작일' : '구독 시작일이 설정되지 않았습니다.'}
          >
            {startBadgeText}
          </span>
        )}

        {/* ✅ 만료일 배지 */}
        {authUser && (
          <span
            className="text-xs px-2 py-0.5 rounded border border-white/20"
            title={subscriptionEndsAt ? '마지막날 24:00까지 사용 가능' : '만료일이 설정되지 않았습니다.'}
          >
            {endBadgeText}
          </span>
        )}

        {/* 구독/업그레이드 or Premium 배지 */}
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
