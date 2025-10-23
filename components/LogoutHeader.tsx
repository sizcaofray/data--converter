'use client';
/**
 * components/LogoutHeader.tsx
 * - 만료(남은 일수 ≤ 0) 시 항상 "구독"
 * - Basic 구독 중이면 "업그레이드"
 * - Premium/Admin이면 "구독관리"
 * - 팝업 컨텍스트가 없으면 /subscribe?open=1 (또는 &upgrade=...)로 이동
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

const END_KEYS = [
  'endAt', 'endsAt', 'expireAt', 'expiredAt', 'endDate', 'subscriptionEnd',
  'basicEnd', 'premiumEnd', 'planEnd', 'paidUntil',
];

const toDateSafe = (v: any): Date | null => {
  if (!v) return null;
  try {
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') {
      const s = v.replace(/\./g, '-').replace(/\//g, '-').trim();
      const d = new Date(s);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (v?.toDate) return v.toDate();
    return null;
  } catch {
    return null;
  }
};

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

  let popupCtx: ReturnType<typeof useSubscribePopup> | null = null;
  try { popupCtx = useSubscribePopup(); } catch { popupCtx = null; }
  const openPopup = popupCtx?.open ?? (() => {});

  let userCtx: ReturnType<typeof useUser> | { user?: any; role?: any; loading?: any } = {};
  try { userCtx = useUser() ?? {}; } catch { userCtx = {}; }

  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u || null));
    return () => unsub();
  }, []);

  const role: 'free' | 'basic' | 'premium' | 'admin' = useMemo(() => {
    const r = String(userCtx?.role ?? 'free').toLowerCase();
    return (['free', 'basic', 'premium', 'admin'] as const).includes(r as any) ? (r as any) : 'free';
  }, [userCtx?.role]);

  const [endDate, setEndDate] = useState<Date | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maybe = pickEndDateFromUserDoc(userCtx as any);
      if (!cancelled && maybe) { setEndDate(maybe); return; }

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

  const remain = useMemo(() => remainingDaysInclusive(endDate), [endDate]);
  const isExpired = remain <= 0;

  const endYYYYMMDD = useMemo(() => {
    if (!endDate) return null;
    const y = endDate.getFullYear();
    const m = String(endDate.getMonth() + 1).padStart(2, '0');
    const d = String(endDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [endDate]);

  const badgeText = useMemo(() => {
    if (isExpired || !endYYYYMMDD) return '만료일 0일';
    return `만료일 ${endYYYYMMDD} (${remain}일)`;
  }, [isExpired, remain, endYYYYMMDD]);

  const goSubscribe = useCallback(() => {
    if (popupCtx) openPopup();               // 인자 없음
    else router.push('/subscribe?open=1');
  }, [popupCtx, openPopup, router]);

  const goUpgrade = useCallback(() => {
    // 🔧 시그니처 불일치 방지: 인자 없이 열고, 프리셋은 쿼리로 처리
    if (popupCtx) openPopup();               // 인자 없음
    else router.push('/subscribe?upgrade=premium&open=1');
  }, [popupCtx, openPopup, router]);

  const showSubscribe = !!authUser && isExpired;
  const showUpgrade   = !!authUser && !isExpired && role === 'basic';
  const showManage    = !!authUser && !isExpired && (role === 'premium' || role === 'admin');

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs rounded px-2 py-1 bg-white/10">{badgeText}</span>

      {showSubscribe && (
        <button
          type="button"
          onClick={goSubscribe}
          className="text-sm rounded px-3 py-1 bg-blue-600 text-white hover:opacity-90"
        >
          구독
        </button>
      )}

      {showUpgrade && (
        <button
          type="button"
          onClick={goUpgrade}
          className="text-sm rounded px-3 py-1 bg-amber-500 text-white hover:opacity-90"
        >
          업그레이드
        </button>
      )}

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
