'use client';

/**
 * components/LogoutHeader.tsx (안정형 전체 코드)
 * ---------------------------------------------------------------------
 * 목적
 *  - 우측 상단의 "구독/업그레이드/구독관리" 버튼 렌더링
 *  - 사용자 역할/만료 상태에 따라 버튼 노출 분기
 *  - 전역 토글(settings/uploadPolicy.subscribeButtonEnabled)로 버튼 일괄 ON/OFF
 *  - 디버그 모드(?debug=1) 지원
 *
 * 전제
 *  - Firebase Auth: users/{uid} 문서에 role, (선택) 여러 만료일 필드가 존재 가능
 *  - Firestore: settings/uploadPolicy 문서에 subscribeButtonEnabled(boolean) 사용
 *  - Bootpay는 나중에 적용하므로, 현재는 /subscribe?open=1 로 이동 처리
 *
 * 안전성
 *  - Firestore onSnapshot 구독만 추가 (외부 영향 X)
 *  - 렌더 게이트만 추가 (기존 정책 계산에 간섭 X)
 *  - 예외/로딩/디버그 고려
 */

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAuth, onAuthStateChanged, getIdTokenResult } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/firebase';
import {
  doc,
  getDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

/* ───────────────────────── 타입/유틸 ───────────────────────── */

type Role = 'free' | 'basic' | 'premium' | 'admin';

interface UserRow {
  uid: string;
  email?: string;
  role?: Role;
  // 만료 관련 다양한 키들이 프로젝트별로 혼재할 수 있어 모두 허용
  endAt?: any;
  endsAt?: any;
  endDate?: any;
  expireAt?: any;
  expiredAt?: any;
  paidUntil?: any;
  subscriptionEnd?: any;
  planEnd?: any;
  basicEnd?: any;
  premiumEnd?: any;
  // 기타
  plan?: 'free' | 'basic' | 'premium';
  createdAt?: any;
  updatedAt?: any;
}

const END_KEYS = [
  'endAt',
  'endsAt',
  'endDate',
  'expireAt',
  'expiredAt',
  'paidUntil',
  'subscriptionEnd',
  'planEnd',
  'basicEnd',
  'premiumEnd',
];

const toDateSafe = (v: any): Date | null => {
  try {
    if (!v) return null;
    if (typeof v?.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(+d) ? null : d;
  } catch {
    return null;
  }
};

const getRemainDays = (u: UserRow): number | null => {
  for (const k of END_KEYS) {
    const d = toDateSafe((u as any)[k]);
    if (d) {
      const diff = Math.floor((d.getTime() - Date.now()) / 86400000); // ms/day
      return diff;
    }
  }
  return null;
};

const useQueryDebugFlag = () => {
  const sp = useSearchParams();
  const flag = sp?.get('debug') === '1';
  const [on, setOn] = React.useState<boolean>(flag);
  React.useEffect(() => {
    if (flag) setOn(true);
  }, [flag]);
  return on;
};

/* ───────────────── 전역 구독 버튼 ON/OFF ───────────────── */

function useSubscribeGlobalEnabled(defaultValue: boolean = true) {
  const [enabled, setEnabled] = React.useState<boolean>(defaultValue);
  React.useEffect(() => {
    // settings/uploadPolicy.subscribeButtonEnabled 구독
    const ref = doc(db, 'settings', 'uploadPolicy');
    return onSnapshot(ref, (snap) => {
      const data = (snap.data() as any) || {};
      const v = data?.subscribeButtonEnabled;
      setEnabled(v === undefined ? true : !!v);
    });
  }, []);
  return enabled;
}

/* ───────────────────────── 컴포넌트 ───────────────────────── */

export default function LogoutHeader() {
  const router = useRouter();
  const debug = useQueryDebugFlag();

  const [loading, setLoading] = React.useState<boolean>(true);
  const [userDoc, setUserDoc] = React.useState<UserRow | null>(null);
  const [email, setEmail] = React.useState<string | undefined>(undefined);
  const [claims, setClaims] = React.useState<Record<string, any> | null>(null);

  // 전역 구독 버튼 활성화 여부
  const subscribeEnabled = useSubscribeGlobalEnabled(true);

  /* 로그인/역할 로딩 */
  React.useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), async (fbUser) => {
      setLoading(true);
      try {
        if (!fbUser) {
          setUserDoc(null);
          setEmail(undefined);
          setClaims(null);
          return;
        }
        setEmail(fbUser.email ?? undefined);

        // users/{uid}
        const uref = doc(db, 'users', fbUser.uid);
        const usnap = await getDoc(uref);
        const udata = (usnap.data() as UserRow | undefined) ?? null;
        setUserDoc(udata);

        // 커스텀 클레임(예: admin)도 유지
        const token = await getIdTokenResult(fbUser, true);
        setClaims(token?.claims ?? null);
      } catch (e) {
        // 실패 시에도 최소한 헤더는 렌더 가능해야 함
        console.warn('[LogoutHeader] user load failed:', e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  /* 정책 계산: 어떤 버튼을 보여줄지 */
  const policy = React.useMemo(() => {
    // 기본값: 비로그인
    let showSubscribe = true;
    let showUpgrade = false;
    let showManage = false;
    let badgeText = '';

    if (!userDoc) {
      // 비로그인: 구독 노출 (전역 게이트는 맨 아래에서 적용)
      showSubscribe = true;
      showUpgrade = false;
      showManage = false;
      badgeText = '';
      return { showSubscribe, showUpgrade, showManage, badgeText };
    }

    const role = userDoc.role ?? 'free';
    const remain = getRemainDays(userDoc);
    const expired = remain !== null ? remain <= 0 : false;

    // 역할별 정책 (요구사항 기반)
    // - free: 구독(만료 여부 상관 없이)
    // - basic: 업그레이드
    // - premium/admin: 구독관리
    if (role === 'free') {
      showSubscribe = true;
      showUpgrade = false;
      showManage = false;
      badgeText = expired ? '만료' : '무료';
    } else if (role === 'basic') {
      showSubscribe = false;
      showUpgrade = true;
      showManage = false;
      badgeText = 'basic';
    } else if (role === 'premium' || role === 'admin') {
      showSubscribe = false;
      showUpgrade = false;
      showManage = true;
      badgeText = role;
    } else {
      // 알 수 없는 값이면 구독만 노출
      showSubscribe = true;
      showUpgrade = false;
      showManage = false;
      badgeText = '';
    }

    return { showSubscribe, showUpgrade, showManage, badgeText };
  }, [userDoc]);

  // ✅ 전역 게이트 적용: 전역이 꺼져 있으면 전부 숨김
  const _showSubscribe = policy.showSubscribe && subscribeEnabled;
  const _showUpgrade = policy.showUpgrade && subscribeEnabled;
  const _showManage = policy.showManage && subscribeEnabled;

  /* 클릭 핸들러: Bootpay는 나중 → 현재는 라우팅만 */
  const openSubscribeFlow = React.useCallback(() => {
    router.push('/subscribe?open=1');
  }, [router]);

  /* 로딩/스켈레톤 (필요 시 최소 UI) */
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-8 w-20 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* (예: 로그인/프로필/알림 등 기존 헤더 요소가 있다면 아래에 추가하십시오) */}

      {_showSubscribe && (
        <button
          className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
          onClick={openSubscribeFlow}
          title="구독"
        >
          구독
        </button>
      )}

      {_showUpgrade && (
        <button
          className="px-3 py-1.5 rounded bg-amber-500 text-white hover:bg-amber-600"
          onClick={openSubscribeFlow}
          title="업그레이드"
        >
          업그레이드
        </button>
      )}

      {_showManage && (
        <button
          className="px-3 py-1.5 rounded bg-slate-700 text-white hover:bg-slate-800"
          onClick={() => router.push('/subscribe/manage')}
          title="구독관리"
        >
          구독관리
        </button>
      )}

      {/* 디버그 배지(요청 시 해제 가능) */}
      {debug && (
        <div className="ml-2 text-xs text-slate-500 select-none">
          {subscribeEnabled ? 'SUB:ON' : 'SUB:OFF'} · {userDoc?.role ?? 'anon'}
        </div>
      )}
    </div>
  );
}
