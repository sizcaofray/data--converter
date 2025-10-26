'use client';

/**
 * 관리자 페이지 (메뉴 비활성화 + 사용자 관리)
 * - UI/디자인 유지, 로직만 보완
 * - 핵심 보완:
 *   1) 컨텍스트 role 로딩 중에는 "권한 없음"을 먼저 띄우지 않음(로딩 표시)
 *   2) 컨텍스트 role이 없을 때 Firestore users/{uid}.role을 즉시 조회하여 대체 판정
 *   3) 둘 중 하나라도 'admin'이면 관리자 접근 허용
 *
 * - 외부 패키지(예: date-fns) 의존 제거(설치 불필요)
 */

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

/* ───────── KST & 날짜 유틸 (설치 없이 동작) ───────── */

// KST(+09:00) 보정
const toKst = (d: Date) => {
  const tzOffsetMin = 9 * 60; // +09:00
  return new Date(d.getTime() + (tzOffsetMin - d.getTimezoneOffset()) * 60 * 1000);
};

// 오늘(0시) KST
const kstToday = () => {
  const now = new Date();
  const k = toKst(now);
  return new Date(k.getFullYear(), k.getMonth(), k.getDate());
};

// KST 오늘 + n일
const kstTodayPlusDays = (days: number) => {
  const base = kstToday();
  base.setDate(base.getDate() + days);
  return base;
};

// "yyyy-MM-dd" → KST 00:00:00 Date
const inputDateToDate = (input: string) => {
  const [y, m, d] = input.split('-').map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0);
};

// "yyyy-MM-dd"
const formatDateYMD = (d: Date | null) => {
  if (!d) return '';
  const k = toKst(d);
  const y = k.getFullYear();
  const m = String(k.getMonth() + 1).padStart(2, '0');
  const day = String(k.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// "yyyy-MM-dd HH:mm"
const formatDateYMDHM = (d: Date | null) => {
  if (!d) return '';
  const k = toKst(d);
  const y = k.getFullYear();
  const m = String(k.getMonth() + 1).padStart(2, '0');
  const day = String(k.getDate()).padStart(2, '0');
  const hh = String(k.getHours()).padStart(2, '0');
  const mm = String(k.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
};

// Firestore Timestamp → Date | null
const tsToDate = (ts: Timestamp | null | undefined) => (ts ? ts.toDate() : null);

type Role = 'admin' | 'basic' | 'premium' | 'free' | undefined;

interface UserRow {
  uid: string;
  email?: string | null;
  displayName?: string | null;

  role?: Role;
  tier?: 'free' | 'basic' | 'premium';
  createdAt?: Timestamp | null;

  // 구독 관련
  subscriptionStartAt?: Timestamp | null;
  subscriptionEndAt?: Timestamp | null;
  remainingDays?: number | null;

  // 디버그/관리용
  lastLoginAt?: Timestamp | null;
  lastPaidAt?: Timestamp | null;
}

const roleToTier = (role?: Role): UserRow['tier'] => {
  switch (role) {
    case 'premium':
      return 'premium';
    case 'basic':
      return 'basic';
    default:
      return 'free';
  }
};

// 종료일 기준 남은 일수(오늘 0시 기준, 음수면 0)
const calcRemainingDaysFromEnd = (end: Timestamp | null): number => {
  if (!end) return 0;
  const endDate = toKst(end.toDate());
  const today = kstToday();
  const diff = Math.ceil((endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
};

export default function AdminPage() {
  const ctx = useUser(); // { user, role, ... }
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🔐 관리자 판정 안정화용 상태
  const [effectiveRole, setEffectiveRole] = useState<Role>(undefined);
  const [roleReady, setRoleReady] = useState(false); // role 최종 판정이 끝났는지

  // 1) 컨텍스트 role 우선 사용, 2) 없으면 Firestore users/{uid}.role 조회
  useEffect(() => {
    let canceled = false;

    (async () => {
      try {
        // 컨텍스트에 role이 이미 있으면 그것을 신뢰
        if (ctx?.role) {
          if (!canceled) {
            setEffectiveRole(ctx.role as Role);
            setRoleReady(true);
          }
          return;
        }

        // 컨텍스트 user는 있는데 role이 비어 있으면 Firestore에서 보조 조회
        const uid = ctx?.user?.uid;
        if (uid) {
          const snap = await getDoc(doc(db, 'users', uid));
          const roleFS = (snap.exists() ? (snap.data()?.role as Role) : undefined) || undefined;
          if (!canceled) {
            setEffectiveRole(roleFS);
            setRoleReady(true);
          }
          return;
        }

        // user도 없으면 아직 로그인/컨텍스트 로딩 단계 → 잠시 대기
        if (!canceled) {
          setEffectiveRole(undefined);
          setRoleReady(false);
        }
      } catch (e) {
        if (!canceled) {
          console.error('[admin] role resolve error:', e);
          setEffectiveRole(undefined);
          setRoleReady(true); // 에러가 나도 더 기다리진 않음
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [ctx?.role, ctx?.user?.uid]);

  // tier 계산(표시용)
  const tier = roleToTier(effectiveRole);

  // 최종 관리자 여부
  const isAdmin = effectiveRole === 'admin';

  // Firestore users 목록 로드
  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const qAdmin = query(
        collection(db, 'users'),
        where('role', '==', 'admin'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const adminSnap = await getDocs(qAdmin);

      const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200));
      const userSnap = await getDocs(qUsers);

      const mapDoc = (d: any): UserRow => {
        const data = d.data() || {};
        const role = (data.role as Role) ?? undefined;
        const row: UserRow = {
          uid: d.id,
          email: data.email ?? null,
          displayName: data.displayName ?? null,
          role,
          tier: roleToTier(role),
          createdAt: data.createdAt ?? null,
          subscriptionStartAt: data.subscriptionStartAt ?? null,
          subscriptionEndAt: data.subscriptionEndAt ?? null,
          remainingDays: data.remainingDays ?? null,
          lastLoginAt: data.lastLoginAt ?? null,
          lastPaidAt: data.lastPaidAt ?? null,
        };
        if (row.remainingDays == null) {
          row.remainingDays = calcRemainingDaysFromEnd(row.subscriptionEndAt ?? null);
        }
        return row;
      };

      const list = [...adminSnap.docs, ...userSnap.docs].map(mapDoc);

      // 중복 uid 제거
      const uniq = new Map<string, UserRow>();
      list.forEach((r) => uniq.set(r.uid, r));
      const merged = Array.from(uniq.values());

      setRows(merged);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || '불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  // role 판정이 끝난 뒤에만 목록 로드
  useEffect(() => {
    if (roleReady && isAdmin) {
      fetchUsers();
    }
  }, [roleReady, isAdmin]);

  // ⛳ ① role 판정이 아직이면 "권한 없음" 대신 로딩만 보여줌
  if (!roleReady) {
    return (
      <main className="p-6">
        <div className="text-sm text-gray-500">로딩 중…</div>
      </main>
    );
  }

  // ⛳ ② 최종 판정: admin 아니면 접근 불가
  if (!isAdmin) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-2">관리자 전용 페이지</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          접근 권한이 없습니다. 관리자 계정으로 로그인해 주세요.
        </p>
        <div className="mt-4 text-xs text-gray-500">
          (현재 판정된 role: <b>{String(effectiveRole ?? 'unknown')}</b>)
        </div>
      </main>
    );
  }

  // ⛳ ③ 여기부터 관리자 화면(기존 UI 유지)
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            className="rounded px-3 py-1 border border-gray-300 dark:border-gray-700 hover:bg-black/5 dark:hover:bg-white/10 text-sm"
          >
            새로고침
          </button>
          <button
            onClick={async () => {
              const uid = prompt('추가할 uid를 입력하세요?');
              if (!uid) return;
              const ref = doc(db, 'users', uid);
              const snap = await getDoc(ref);
              if (!snap.exists()) {
                await setDoc(ref, { role: 'free', createdAt: serverTimestamp() });
              }
              alert('추가/갱신 완료');
              fetchUsers();
            }}
            className="rounded px-3 py-1 border border-gray-300 dark:border-gray-700 hover:bg-black/5 dark:hover:bg-white/10 text-sm"
          >
            사용자 추가
          </button>
        </div>
      </div>

      {/* 디버그 패널 */}
      <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-600 dark:text-gray-300">
        <div>
          effective role: <b>{String(effectiveRole ?? 'unknown')}</b> → tier:{' '}
          <b>{String(tier)}</b>
        </div>
      </div>

      {/* 목록 */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-gray-700">
          <div className="col-span-2">UID</div>
          <div className="col-span-2">이메일</div>
          <div className="col-span-2">닉네임</div>
          <div className="col-span-1">역할</div>
          <div className="col-span-2">구독(시작~종료)</div>
          <div className="col-span-1">남은일수</div>
          <div className="col-span-2">기타</div>
        </div>

        {loading && <div className="px-5 py-4 text-sm text-gray-500">로딩 중…</div>}
        {error && (
          <div className="px-5 py-4 text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((r) => {
            const start = tsToDate(r.subscriptionStartAt ?? null);
            const end = tsToDate(r.subscriptionEndAt ?? null);
            const startStr = formatDateYMD(start);
            const endStr = formatDateYMD(end);

            return (
              <div key={r.uid} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
                <div className="col-span-2"><div className="font-mono text-xs">{r.uid}</div></div>
                <div className="col-span-2"><div className="truncate">{r.email ?? '-'}</div></div>
                <div className="col-span-2"><div className="truncate">{r.displayName ?? '-'}</div></div>
                <div className="col-span-1">
                  <select
                    value={r.role ?? 'free'}
                    onChange={(e) => patchRow(r.uid, { role: e.target.value as Role, tier: roleToTier(e.target.value as Role) })}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
                  >
                    <option value="admin">admin</option>
                    <option value="premium">premium</option>
                    <option value="basic">basic</option>
                    <option value="free">free</option>
                  </select>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="date"
                    value={startStr}
                    onChange={(e) => {
                      const newStart = inputDateToDate(e.target.value);
                      const currEnd = r.subscriptionEndAt?.toDate() ?? null;
                      const clampedEnd = (currEnd && newStart && currEnd.getTime() < newStart.getTime())
                        ? new Date(newStart.getFullYear(), newStart.getMonth(), newStart.getDate() + 1)
                        : currEnd;
                      const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
                      patchRow(r.uid, {
                        subscriptionStartAt: Timestamp.fromDate(newStart),
                        subscriptionEndAt: endTs,
                        remainingDays: calcRemainingDaysFromEnd(endTs ? Timestamp.fromDate(clampedEnd!) : null),
                      });
                    }}
                    className="w-[140px] rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
                  />
                  <span>~</span>
                  <input
                    type="date"
                    value={endStr}
                    onChange={(e) => {
                      const newEnd = inputDateToDate(e.target.value);
                      const currStart = r.subscriptionStartAt?.toDate() ?? null;
                      const clampedEnd = (currStart && newEnd && newEnd.getTime() < currStart.getTime())
                        ? new Date(currStart.getFullYear(), currStart.getMonth(), currStart.getDate() + 1)
                        : newEnd;
                      const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
                      patchRow(r.uid, {
                        subscriptionEndAt: endTs,
                        remainingDays: calcRemainingDaysFromEnd(endTs ? Timestamp.fromDate(clampedEnd!) : null),
                      });
                    }}
                    className="w-[140px] rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    type="number"
                    min={0}
                    value={r.remainingDays ?? 0}
                    onChange={(e) => {
                      const n = Math.max(0, Number(e.target.value || 0));
                      const endDate = kstTodayPlusDays(n);
                      patchRow(r.uid, { remainingDays: n, subscriptionEndAt: Timestamp.fromDate(endDate) });
                    }}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
                  />
                </div>
                <div className="col-span-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                  <div>생성: {r.createdAt ? formatDateYMDHM(tsToDate(r.createdAt)) : '-'}</div>
                  <div>최근로그인: {r.lastLoginAt ? formatDateYMDHM(tsToDate(r.lastLoginAt)) : '-'}</div>
                  <div>최근결제: {r.lastPaidAt ? formatDateYMDHM(tsToDate(r.lastPaidAt)) : '-'}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
