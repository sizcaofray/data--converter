'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase'; // ✅ 프로젝트 경로 유지

type PlanType = 'basic' | 'premium' | null;

interface UserState {
  email: string | null;
  uid: string | null;
  plan: PlanType;
  subscriptionEndsAt: Date | null;
  lastUsedAt: Date | null;
}

/** YYYY-MM-DD HH:mm 포맷터 (로컬 타임존 기준) */
function formatDateTime(dt: Date): string {
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  const y = dt.getFullYear();
  const m = pad(dt.getMonth() + 1);
  const d = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const mm = pad(dt.getMinutes());
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

/** 날짜 차이를 “일” 단위로 계산(자정 기준 정규화) */
function diffDaysUTC(a: Date, b: Date): number {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const da = startOfDay(a).getTime();
  const db = startOfDay(b).getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((da - db) / MS_PER_DAY);
}

/** Firestore Timestamp/ISO/number → Date 안전 변환 */
function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (v?.toDate) {
    const d = v.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export default function LogoutHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [u, setU] = useState<UserState>({
    email: null,
    uid: null,
    plan: null,
    subscriptionEndsAt: null,
    lastUsedAt: null,
  });

  // 구독/업그레이드 팝업 제어 (기존 SubscribePopup과 연동)
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [subscribeMode, setSubscribeMode] = useState<'new' | 'upgrade'>('new');
  const [lockedPlan, setLockedPlan] = useState<PlanType>(null);
  const [disabledPlans, setDisabledPlans] = useState<PlanType[]>([]);

  // 🔹 인증 상태 구독 + 유저 문서 실시간 구독
  useEffect(() => {
    const unSub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser ?? null);
      if (!fbUser) {
        setU({ email: null, uid: null, plan: null, subscriptionEndsAt: null, lastUsedAt: null });
        return;
      }

      const ref = doc(db, 'users', fbUser.uid);

      // 마지막 사용일 갱신(읽기 권한 문제로 실패해도 무시)
      try {
        await updateDoc(ref, { lastUsedAt: serverTimestamp() });
      } catch {}

      return onSnapshot(ref, (snap) => {
        const d = snap.data() || {};
        const plan: PlanType = (d.plan ?? null) as PlanType;

        setU({
          email: fbUser.email,
          uid: fbUser.uid,
          plan,
          subscriptionEndsAt: toDateSafe(d.subscriptionEndsAt),
          lastUsedAt: toDateSafe(d.lastUsedAt),
        });
      });
    });

    return () => {
      if (typeof unSub === 'function') unSub();
    };
  }, []);

  // 남은 일수 계산
  const daysLeft = useMemo(() => {
    if (!u.subscriptionEndsAt) return null;
    return diffDaysUTC(u.subscriptionEndsAt, new Date());
  }, [u.subscriptionEndsAt]);

  // 마지막 사용일 포맷
  const lastUsedLabel = useMemo(() => {
    if (!u.lastUsedAt) return null;
    return formatDateTime(u.lastUsedAt);
  }, [u.lastUsedAt]);

  const isPremium = u.plan === 'premium';
  const isBasic = u.plan === 'basic';
  const isGuest = !u.uid;

  const handleSubscribeClick = () => {
    setSubscribeMode('new');
    setLockedPlan(null);
    setDisabledPlans([]);
    setShowSubscribe(true);
  };

  const handleUpgradeClick = () => {
    setSubscribeMode('upgrade');
    setLockedPlan('premium');     // 프리미엄 고정
    setDisabledPlans(['basic']);  // basic 비활성화
    setShowSubscribe(true);
  };

  return (
    <div className="flex items-center gap-3">
      {/* 🔹 남은기간/마지막사용일 배지: 이메일 앞에 작게 */}
      {u.uid && (
        <div className="flex items-center gap-2">
          {daysLeft !== null && (
            <span
              className="px-2 py-0.5 rounded-full text-xs border border-gray-300/60 dark:border-gray-600/60"
              title={u.subscriptionEndsAt ? `만료일: ${formatDateTime(u.subscriptionEndsAt)}` : undefined}
            >
              남은 {daysLeft}일
            </span>
          )}
          {lastUsedLabel && (
            <span
              className="px-2 py-0.5 rounded-full text-xs border border-gray-300/60 dark:border-gray-600/60"
              title="마지막 사용일"
            >
              마지막 {lastUsedLabel}
            </span>
          )}
        </div>
      )}

      {/* 🔹 사용자 이메일 (디자인 유지) */}
      <div className="flex items-center">
        {u.email ? (
          <span className="text-sm font-medium">{u.email}</span>
        ) : (
          <span className="text-sm opacity-70">로그인 필요</span>
        )}
      </div>

      {/* 🔹 구독/업그레이드/프리미엄 배지 */}
      <div className="ml-2">
        {isPremium && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-500/60 text-emerald-600 dark:text-emerald-400">
            프리미엄 이용중
          </span>
        )}

        {isBasic && (
          <button
            type="button"
            onClick={handleUpgradeClick}
            className="px-3 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="프리미엄으로 업그레이드"
            title="프리미엄으로 업그레이드"
          >
            업그레이드
          </button>
        )}

        {!isPremium && !isBasic && (
          <button
            type="button"
            onClick={handleSubscribeClick}
            className="px-3 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="구독"
            title="구독"
            disabled={isGuest}
          >
            구독
          </button>
        )}
      </div>

      {/* ✅ 기존 SubscribePopup과 연동: props 이름만 맞추면 됩니다.
      <SubscribePopup
        open={showSubscribe}
        onClose={() => setShowSubscribe(false)}
        mode={subscribeMode}
        lockedPlan={lockedPlan}
        disabledPlans={disabledPlans}
        userEmail={u.email ?? undefined}
        userId={u.uid ?? undefined}
      /> */}
    </div>
  );
}
