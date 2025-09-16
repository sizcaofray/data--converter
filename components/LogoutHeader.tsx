'use client';

/**
 * ✅ 핵심 원칙
 * - 상위 헤더의 래퍼/정렬/구분선은 "부모"가 담당하므로 이 컴포넌트에서는 건드리지 않는다.
 * - 새로 추가되는 배지(남은기간, 마지막 사용일)는 "이메일 텍스트 앞"에만 인라인으로 삽입한다.
 * - 기존 버튼(구독/업그레이드/로그아웃 등)의 클래스/위치는 바꾸지 않는다.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// ---------- 유틸 (dayjs 없이 네이티브로 처리) ----------
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const formatDateTime = (dt: Date) =>
  `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
const diffDays = (end?: Date | null) =>
  end ? Math.round((startOfDay(end).getTime() - startOfDay(new Date()).getTime()) / (24 * 60 * 60 * 1000)) : null;
const toDateSafe = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) {
    const d = v.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// ---------- 타입 ----------
type PlanType = 'basic' | 'premium' | null;

interface UserState {
  email: string | null;
  uid: string | null;
  plan: PlanType;
  subscriptionEndsAt: Date | null;
  lastUsedAt: Date | null;
}

export default function LogoutHeader() {
  // ✅ 외부(부모) 레이아웃은 그대로 유지. 이 컴포넌트는 "인라인 요소"만 쌓는다.
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [u, setU] = useState<UserState>({
    email: null,
    uid: null,
    plan: null,
    subscriptionEndsAt: null,
    lastUsedAt: null,
  });

  // 팝업 제어(이미 프로젝트에 있는 SubscribePopup을 그대로 연동)
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [subscribeMode, setSubscribeMode] = useState<'new' | 'upgrade'>('new');
  const [lockedPlan, setLockedPlan] = useState<PlanType>(null);
  const [disabledPlans, setDisabledPlans] = useState<PlanType[]>([]);

  // ---------- 인증/유저 문서 구독 ----------
  useEffect(() => {
    const off = onAuthStateChanged(auth, (user) => {
      setFbUser(user ?? null);
      if (!user) {
        setU({ email: null, uid: null, plan: null, subscriptionEndsAt: null, lastUsedAt: null });
        return;
      }

      const ref = doc(db, 'users', user.uid);

      // 마지막 사용일 갱신(실패해도 무시)
      updateDoc(ref, { lastUsedAt: serverTimestamp() }).catch(() => {});

      // 실시간 문서 구독
      return onSnapshot(ref, (snap) => {
        const d = snap.data() || {};
        const plan: PlanType = (d.plan ?? null) as PlanType;
        setU({
          email: user.email,
          uid: user.uid,
          plan,
          subscriptionEndsAt: toDateSafe(d.subscriptionEndsAt),
          lastUsedAt: toDateSafe(d.lastUsedAt),
        });
      });
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  const daysLeft = useMemo(() => diffDays(u.subscriptionEndsAt), [u.subscriptionEndsAt]);
  const lastUsedLabel = useMemo(() => (u.lastUsedAt ? formatDateTime(u.lastUsedAt) : null), [u.lastUsedAt]);

  const isPremium = u.plan === 'premium';
  const isBasic = u.plan === 'basic';
  const isGuest = !u.uid;

  const handleSubscribeClick = () => {
    // 새 구독(모든 플랜 선택 가능)
    setSubscribeMode('new');
    setLockedPlan(null);
    setDisabledPlans([]);
    setShowSubscribe(true);
  };

  const handleUpgradeClick = () => {
    // 업그레이드(프리미엄만 선택 가능)
    setSubscribeMode('upgrade');
    setLockedPlan('premium');
    setDisabledPlans(['basic']);
    setShowSubscribe(true);
  };

  // ---------- 렌더 ----------
  return (
    <div className="inline-flex items-center gap-2">
      {/* ✅ 새 요소는 모두 "왼쪽"에 인라인으로 추가 — 레이아웃(정렬/구분선) 불변 */}
      {u.uid && daysLeft !== null && (
        <span
          className="mr-1 inline-flex items-center rounded-full border border-gray-300/60 dark:border-gray-600/60 px-2 py-0.5 text-xs"
          title={u.subscriptionEndsAt ? `만료일: ${formatDateTime(u.subscriptionEndsAt)}` : undefined}
        >
          남은 {daysLeft}일
        </span>
      )}
      {u.uid && lastUsedLabel && (
        <span
          className="mr-2 inline-flex items-center rounded-full border border-gray-300/60 dark:border-gray-600/60 px-2 py-0.5 text-xs"
          title="마지막 사용일"
        >
          마지막 {lastUsedLabel}
        </span>
      )}

      {/* ✅ 기존 이메일 위치/스타일 유지 */}
      <span className="text-sm font-medium">{u.email ?? '로그인 필요'}</span>

      {/* ✅ 기존 버튼 영역도 그대로 — 라벨/동작만 조건 분기 */}
      {!isPremium && (
        <button
          type="button"
          onClick={isBasic ? handleUpgradeClick : handleSubscribeClick}
          className="ml-2 px-3 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={isBasic ? '프리미엄으로 업그레이드' : '구독'}
          title={isBasic ? '프리미엄으로 업그레이드' : '구독'}
          disabled={isGuest}
        >
          {isBasic ? '업그레이드' : '구독'}
        </button>
      )}
      {isPremium && (
        <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-emerald-500/60 text-emerald-600 dark:text-emerald-400">
          프리미엄 이용중
        </span>
      )}

      {/* ✅ 로그아웃 버튼: 기존과 동일하게 유지 (클래스/위치 변경 금지) */}
      {fbUser && (
        <button
          type="button"
          onClick={() => signOut(auth).catch(() => {})}
          className="ml-2 px-3 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          로그아웃
        </button>
      )}

      {/* ✅ 프로젝트에 이미 존재하는 SubscribePopup 사용(디자인 불변).
          팝업 컴포넌트 파일에서 mode/lockedPlan/disabledPlans를 지원하지 않으면
          아래 props는 제거하세요. */}
      {/* 
      <SubscribePopup
        open={showSubscribe}
        onClose={() => setShowSubscribe(false)}
        mode={subscribeMode}
        lockedPlan={lockedPlan}
        disabledPlans={disabledPlans}
        userEmail={u.email ?? undefined}
        userId={u.uid ?? undefined}
      />
      */}
    </div>
  );
}
