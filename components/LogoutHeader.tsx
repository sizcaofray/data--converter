'use client';
/**
 * components/LogoutHeader.tsx
 * ------------------------------------------------------------------
 * ✅ 요구사항
 *  1) 구독 만료(남은 일수 ≤ 0)면 항상 "구독" 버튼
 *  2) 구독 중에 role==='basic'이면 "업그레이드" 버튼
 *  3) 구독 중에 role ∈ {premium, admin}이면 "구독관리" 버튼
 *  4) "구독" 클릭 시: SubscribePopup 컨텍스트가 있으면 팝업, 없으면 /subscribe?open=1 로 이동(페이지에서 자동 팝업 오픈)
 *
 * 🧩 기존 기능/디자인은 유지하고 로직만 보강합니다.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useUser } from '@/contexts/UserContext';
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';

/* 만료일 키 후보(프로젝트 내 다양한 필드명을 폭넓게 수용) */
const END_KEYS = [
  'endAt', 'endsAt', 'expireAt', 'expiredAt', 'endDate', 'subscriptionEnd',
  'basicEnd', 'premiumEnd', 'planEnd', 'paidUntil',
];

/** 안전한 Date 파싱(숫자/문자열/Firestore Timestamp 지원) */
const toDateSafe = (v: any): Date | null => {
  if (!v) return null;
  try {
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') {
      const s = v.replace(/\./g, '-').replace(/\//g, '-').trim();
      const d = new Date(s);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (v?.toDate) return v.toDate(); // Firestore Timestamp
    return null;
  } catch {
    return null;
  }
};

/** 마지막 날 24:00까지 포함한 남은 일수(최소 0) */
const remainingDaysInclusive = (end: Date | null | undefined): number => {
  if (!end) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const endNext = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, 0, 0, 0, 0);
  const diff = endNext.getTime() - start.getTime();
  if (!Number.isFinite(diff)) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(Math.ceil(diff / dayMs), 0);
};

/** users/{uid} 문서에서 만료일 후보 키를 찾아 반환(중첩(subscription/billing/plan) 포함) */
const pickEndDateFromUserDoc = (obj: any): Date | null => {
  if (!obj) return null;
  for (const k of END_KEYS) {
    if (obj[k] != null) {
      const d = toDateSafe(obj[k]);
      if (d) return d;
    }
  }
  for (const nest of ['subscription', 'billing', 'plan']) {
    const box = obj?.[nest];
    if (box && typeof box === 'object') {
      for (const k of END_KEYS) {
        if (box[k] != null) {
          const d = toDateSafe(box[k]);
          if (d) return d;
        }
      }
    }
  }
  return null;
};

export default function LogoutHeader() {
  const router = useRouter();

  /** SubscribePopup 컨텍스트(없어도 안전하게 처리) */
  let popupCtx: ReturnType<typeof useSubscribePopup> | null = null;
  try { popupCtx = useSubscribePopup(); } catch { popupCtx = null; }
  const openPopup = popupCtx?.open ?? (() => {});

  /** User 컨텍스트(없어도 안전) */
  let userCtx: ReturnType<typeof useUser> | { user?: any; role?: any; loading?: any } = {};
  try { userCtx = useUser() ?? {}; } catch { userCtx = {}; }

  /** Firebase Auth 상태 유지 */
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u || null));
    return () => unsub();
  }, []);

  /** 역할 정규화 */
  const role: 'free' | 'basic' | 'premium' | 'admin' = useMemo(() => {
    const r = String(userCtx?.role ?? 'free').toLowerCase();
    return (['free', 'basic', 'premium', 'admin'] as const).includes(r as any) ? (r as any) : 'free';
  }, [userCtx?.role]);

  /** 만료일: 컨텍스트 → Firestore 폴백 */
  const [endDate, setEndDate] = useState<Date | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) 컨텍스트에서 먼저 시도
      const maybe = pickEndDateFromUserDoc(userCtx as any);
      if (!cancelled && maybe) { setEndDate(maybe); return; }

      // 2) Firestore 1회 조회(컨텍스트에 없을 때)
      const uid = authUser?.uid;
      if (!uid) { setEndDate(null); return; }
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const data = snap.exists() ? snap.data() : {};
        const d = pickEndDateFromUserDoc(data);
        if (!cancelled) setEndDate(d);
      } catch {
        if (!cancelled) setEndDate(null);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser?.uid, userCtx]);

  /** 남은 일수/만료 여부 */
  const remain = useMemo(() => remainingDaysInclusive(endDate), [endDate]);
  const isExpired = remain <= 0;

  /** YYYY-MM-DD 포맷 */
  const endYYYYMMDD = useMemo(() => {
    if (!endDate) return null;
    const y = endDate.getFullYear();
    const m = String(endDate.getMonth() + 1).padStart(2, '0');
    const d = String(endDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [endDate]);

  /** 표시용 배지 텍스트 */
  const badgeText = useMemo(() => {
    if (isExpired || !endYYYYMMDD) return '만료일 0일';
    return `만료일 ${endYYYYMMDD} (${remain}일)`;
  }, [isExpired, remain, endYYYYMMDD]);

  /** 버튼 액션: 팝업 우선, 미존재 시 /subscribe?open=1 로 이동(페이지에서 자동 오픈) */
  const goSubscribe = useCallback(() => {
    if (popupCtx) openPopup();
    else router.push('/subscribe?open=1');
  }, [popupCtx, openPopup, router]);

  const goUpgrade = useCallback(() => {
    if (popupCtx) openPopup({ preselect: 'premium', upgradeOnly: true } as any);
    else router.push('/subscribe?upgrade=premium&open=1');
  }, [popupCtx, openPopup, router]);

  /** 버튼 가시성: 만료 최우선 → 업그레이드 → 관리 */
  const showSubscribe = !!authUser && isExpired;
  const showUpgrade   = !!authUser && !isExpired && role === 'basic';
  const showManage    = !!authUser && !isExpired && (role === 'premium' || role === 'admin');

  return (
    <div className="flex items-center gap-2">
      {/* 남은 일수 배지 (기존 스타일 유지) */}
      <span className="text-xs rounded px-2 py-1 bg-white/10">{badgeText}</span>

      {/* 만료 → 구독 */}
      {showSubscribe && (
        <button
          type="button"
          onClick={goSubscribe}
          className="text-sm rounded px-3 py-1 bg-blue-600 text-white hover:opacity-90"
        >
          구독
        </button>
      )}

      {/* Basic → 업그레이드 */}
      {showUpgrade && (
        <button
          type="button"
          onClick={goUpgrade}
          className="text-sm rounded px-3 py-1 bg-amber-500 text-white hover:opacity-90"
        >
          업그레이드
        </button>
      )}

      {/* Premium/Admin → 구독관리 */}
      {showManage && (
        <button
          type="button"
          onClick={() => router.push('/subscribe')}
          className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
        >
          구독관리
        </button>
      )}
    </div>
  );
}
