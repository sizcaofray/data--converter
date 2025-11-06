'use client';

/**
 * 관리자 페이지 (메뉴 비활성화 + 사용자 관리 + 구독버튼 전역토글 + ✅ 메뉴 유료화 체크)
 * - 새 파일 추가 없음, 디자인 유지, 로직만 보강
 * - Firestore 저장 키
 *   - 비활성 목록: settings/uploadPolicy.navigation.disabled : string[]
 *   - ✅ 유료화 목록: settings/uploadPolicy.navigation.paid : string[]
 *   - 구독 버튼: settings/uploadPolicy.subscribeButtonEnabled : boolean
 */

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
  onSnapshot,
  setDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { getAuth, getIdTokenResult, onAuthStateChanged } from 'firebase/auth';

type Role = 'free' | 'basic' | 'premium' | 'admin';

interface UserRow {
  uid: string;
  email: string;
  role: Role;
  uniqueId?: string | null;
  joinedAt?: Timestamp | null;
  isSubscribed?: boolean;
  subscriptionStartAt?: Timestamp | null;
  subscriptionEndAt?: Timestamp | null;
  remainingDays?: number | null;
}

/** KST 자정 기준 도우미들 (기존 유지) */
function todayKST(): Date {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}
function dateToInput(d: Date | null) {
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function tsToInputDate(ts: Timestamp | null | undefined) {
  if (!ts) return '';
  const d = ts.toDate();
  return dateToInput(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}
function inputDateToDate(s: string) {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}
function calcRemainingDaysFromEnd(end: Timestamp | null | undefined) {
  if (!end) return null;
  const e = end.toDate();
  const eu = new Date(Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()));
  const base = todayKST();
  const diff = eu.getTime() - base.getTime();
  const n = Math.ceil(diff / 86400000);
  return n < 0 ? 0 : n;
}
function kstTodayPlusDays(n: number) {
  const base = todayKST();
  return new Date(base.getTime() + n * 86400000);
}
function clampEndAfterStart(start: Date | null, end: Date | null) {
  if (!start || !end) return end;
  return end.getTime() < start.getTime() ? start : end;
}

const DEFAULT_SUBSCRIPTION_DAYS = 30;

/** 메뉴 메타 (페이지 실제 경로/표시명에 맞게 유지) */
type MenuConfig = { slug: string; label: string };
const ALL_MENUS: MenuConfig[] = [
  { slug: 'convert',         label: 'Data Convert' },
  { slug: 'compare',         label: 'Compare' },
  { slug: 'pdf-tool',        label: 'PDF Tool' },
  { slug: 'pattern-editor',  label: 'Pattern Editor' },
  { slug: 'random',          label: 'Random' },
  { slug: 'admin',           label: 'Admin' },
];

/** 유틸 */
function sanitizeSlugArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => (typeof v === 'string' ? v : String(v ?? '').trim()))
    .filter((v) => v.length > 0);
}
function pruneUndefined<T extends Record<string, any>>(obj: T): T {
  const walk = (v: any): any => {
    if (v === undefined) return undefined;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: any = {};
      for (const k of Object.keys(v)) {
        const w = walk(v[k]);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    return v;
  };
  return walk(obj);
}
function safeStringify(o: any) {
  try {
    const seen = new WeakSet();
    return JSON.stringify(
      o,
      (k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      },
      2
    );
  } catch {
    return String(o);
  }
}

export default function AdminPage() {
  const { role: myRoleFromContext, loading: userCtxLoading } = useUser();

  // ── [A] 관리자 판정 (users/{uid}.role === 'admin')
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [usersDocRole, setUsersDocRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setRoleLoading(true);
      try {
        if (!u) {
          setAuthUid(null);
          setUsersDocRole(null);
          return;
        }
        setAuthUid(u.uid);
        try { await getIdTokenResult(u, true); } catch {}
        const uref = doc(db, 'users', u.uid);
        const usnap = await getDoc(uref);
        const r = (usnap.exists() ? (usnap.data() as any)?.role : null) as Role | null;
        setUsersDocRole(r ?? null);
      } finally {
        setRoleLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const isAdminRole = usersDocRole === 'admin';

  // ── [B] 메뉴 관리 + 전역 구독 버튼 + ✅ 유료화 목록
  const [navDisabled, setNavDisabled] = useState<string[]>([]);  // 비활성 목록
  const [navPaid, setNavPaid] = useState<string[]>([]);          // ✅ 유료화 목록
  const [subscribeEnabled, setSubscribeEnabled] = useState<boolean>(true); // 구독버튼 전역 토글
  const [savingNav, setSavingNav] = useState(false);

  // 디버그 패널 상태
  const [showDebug, setShowDebug] = useState(true);
  const [dbg, setDbg] = useState<{
    uploadPolicyPayload?: any;
    lastError?: { code?: any; message?: any; customData?: any } | null;
  }>({});

  // settings/uploadPolicy 실시간 구독
  useEffect(() => {
    if (roleLoading || !isAdminRole) return;
    const ref = doc(db, 'settings', 'uploadPolicy');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.data() as any) || {};
        const arrDisabled = Array.isArray(data?.navigation?.disabled) ? data.navigation.disabled : [];
        const arrPaid = Array.isArray(data?.navigation?.paid) ? data.navigation.paid : []; // ✅ 유료화
        setNavDisabled(sanitizeSlugArray(arrDisabled));
        setNavPaid(sanitizeSlugArray(arrPaid));                                            // ✅ 유료화
        setSubscribeEnabled(
          data?.subscribeButtonEnabled === undefined
            ? true
            : Boolean(data.subscribeButtonEnabled)
        );
      },
      (err) => {
        setDbg((d) => ({ ...d, lastError: { code: err?.code, message: err?.message, customData: err?.customData } }));
      }
    );
    return () => unsub();
  }, [roleLoading, isAdminRole]);

  const disabledSet = useMemo(() => new Set(navDisabled), [navDisabled]);
  const paidSet = useMemo(() => new Set(navPaid), [navPaid]);            // ✅

  /** 비활성 체크 토글 */
  const toggleMenuDisabled = (slug: string) => {
    setNavDisabled((prev) => {
      const s = new Set(prev);
      s.has(slug) ? s.delete(slug) : s.add(slug);
      return Array.from(s);
    });
  };

  /** ✅ 유료화 체크 토글 */
  const toggleMenuPaid = (slug: string) => {
    setNavPaid((prev) => {
      const s = new Set(prev);
      s.has(slug) ? s.delete(slug) : s.add(slug);
      return Array.from(s);
    });
  };

  /** 디버그 페이로드 */
  const dumpPolicyPayload = () => {
    const payload = pruneUndefined({
      navigation: { disabled: sanitizeSlugArray(navDisabled), paid: sanitizeSlugArray(navPaid) }, // ✅ paid 포함
      subscribeButtonEnabled: subscribeEnabled,
      updatedAt: serverTimestamp(),
    });
    setDbg({ uploadPolicyPayload: payload });
  };

  /** 저장(관리자 전용) */
  const saveMenuPolicy = async () => {
    if (!isAdminRole) {
      alert('저장 권한이 없습니다. (users/{uid}.role이 admin이어야 합니다)');
      return;
    }
    setSavingNav(true);
    dumpPolicyPayload();
    try {
      const ref = doc(db, 'settings', 'uploadPolicy');
      await setDoc(
        ref,
        {
          navigation: {
            disabled: sanitizeSlugArray(navDisabled),
            paid: sanitizeSlugArray(navPaid),                      // ✅ paid 저장
          },
          subscribeButtonEnabled: subscribeEnabled,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setDbg((d) => ({ ...d, lastError: null }));
      alert('메뉴 정책이 저장되었습니다.');
    } catch (e: any) {
      setDbg((d) => ({ ...d, lastError: { code: e?.code, message: e?.message, customData: e?.customData } }));
      alert(`저장 중 오류: ${e?.code || e?.message || '알 수 없는 오류'}`);
    } finally {
      setSavingNav(false);
    }
  };

  // ── [C] 사용자 관리(기존 유지)
  const [rows, setRows] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (roleLoading || !isAdminRole) return;
    (async () => {
      setFetching(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list: UserRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          const endTs: Timestamp | null = data.subscriptionEndAt ?? null;
          list.push({
            uid: d.id,
            email: data.email ?? '',
            role: (data.role ?? 'free') as Role,
            uniqueId: data.uniqueId ?? null,
            joinedAt: data.joinedAt ?? null,
            isSubscribed: data.isSubscribed ?? false,
            subscriptionStartAt: data.subscriptionStartAt ?? null,
            subscriptionEndAt: endTs,
            remainingDays: calcRemainingDaysFromEnd(endTs),
          });
        });
        list.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
        setRows(list);
      } finally {
        setFetching(false);
      }
    })();
  }, [roleLoading, isAdminRole]);

  const patchRow = (uid: string, patch: Partial<UserRow>) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const toggleSubscribed = (r: UserRow, checked: boolean) => {
    if (!checked) {
      patchRow(r.uid, {
        isSubscribed: false,
        subscriptionStartAt: null,
        subscriptionEndAt: null,
        remainingDays: null,
      });
      return;
    }
    const startDate = r.subscriptionStartAt?.toDate() ?? todayKST();
    const endDate = r.subscriptionEndAt?.toDate() ?? kstTodayPlusDays(DEFAULT_SUBSCRIPTION_DAYS);
    const endTs = clampEndAfterStart(startDate, endDate);
    patchRow(r.uid, {
        isSubscribed: true,
        subscriptionStartAt: Timestamp.fromDate(startDate),
        subscriptionEndAt: endTs ? Timestamp.fromDate(endTs) : null,
        remainingDays: calcRemainingDaysFromEnd(endTs ? Timestamp.fromDate(endTs) : null),
    });
  };

  const changeRemainingDays = (r: UserRow, val: string) => {
    const n = Math.max(0, Number(val || 0));
    const endDate = kstTodayPlusDays(n);
    patchRow(r.uid, { remainingDays: n, subscriptionEndAt: Timestamp.fromDate(endDate) });
  };

  const changeStartDate = (r: UserRow, input: string) => {
    const newStart = inputDateToDate(input);
    const currEnd = r.subscriptionEndAt?.toDate() ?? null;
    const clampedEnd = clampEndAfterStart(newStart, currEnd);
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
    patchRow(r.uid, {
      subscriptionStartAt: newStart ? Timestamp.fromDate(newStart) : null,
      subscriptionEndAt: endTs,
      remainingDays: calcRemainingDaysFromEnd(endTs),
    });
  };

  const changeEndDate = (r: UserRow, input: string) => {
    const newEnd = inputDateToDate(input);
    const start = r.subscriptionStartAt?.toDate() ?? null;
    const clampedEnd = clampEndAfterStart(start, newEnd);
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
    patchRow(r.uid, {
      subscriptionEndAt: endTs,
      remainingDays: calcRemainingDaysFromEnd(endTs),
    });
  };

  const handleSave = async (row: UserRow) => {
    setSaving(row.uid);
    try {
      const ref = doc(db, 'users', row.uid);
      let startTs: Timestamp | null = row.subscriptionStartAt ?? null;
      let endTs: Timestamp | null = row.subscriptionEndAt ?? null;
      let isSubscribed = !!row.isSubscribed;

      if (!isSubscribed) {
        startTs = null;
        endTs = null;
      } else {
        const startD = startTs?.toDate() ?? null;
        const endD = endTs?.toDate() ?? null;
        const clampedEnd = clampEndAfterStart(startD, endD);
        endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
      }

      await updateDoc(ref, {
        role: row.role,
        isSubscribed,
        subscriptionStartAt: startTs ?? null,
        subscriptionEndAt: endTs ?? null,
      });
      alert('저장되었습니다.');
    } catch (e: any) {
      alert(`저장 중 오류: ${e?.code || e?.message || '알 수 없는 오류'}`);
    } finally {
      setSaving(null);
    }
  };

  if (userCtxLoading || roleLoading)
    return <main className="p-6 text-sm text-gray-500">로딩 중...</main>;

  if (!isAdminRole)
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-4">관리자 페이지</h1>
        <p className="text-red-600 dark:text-red-400">
          ⛔ 관리자 권한이 없습니다. (<code>users/{'{'}uid{'}'}.role</code> 기준)
        </p>
      </main>
    );

  return (
    <main className="p-6 space-y-6">
      {/* ───────────── 메뉴 관리 섹션: 비활성 + 유료화 + 구독버튼 ───────────── */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <h2 className="text-lg font-bold mb-2">메뉴 관리</h2>

        {/* 전역: 구독 버튼 활성화 */}
        <div className="flex items-center gap-3 mb-4">
          <span className="font-medium">구독 버튼 활성화</span>
          <button
            type="button"
            className={`px-3 py-1 rounded border ${subscribeEnabled ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
            onClick={() => setSubscribeEnabled(v => !v)}
            aria-pressed={subscribeEnabled}
            aria-label="구독 버튼 활성화 토글"
          >
            {subscribeEnabled ? '활성화' : '비활성화'}
          </button>
        </div>

        {/* A. 비활성화(OFF) */}
        <h3 className="text-sm font-semibold mt-2 mb-2">비활성화(OFF)</h3>
        <p className="text-xs text-slate-600 mb-3">
          체크된 메뉴는 사이드바에서 <b>보여지되 클릭이 차단</b>됩니다. (<code>settings/uploadPolicy.navigation.disabled</code>)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {ALL_MENUS.map((m) => {
            const checked = disabledSet.has(m.slug);
            return (
              <label
                key={m.slug}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3 cursor-pointer"
                title={checked ? '비활성화됨' : '활성화됨'}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked}
                  onChange={() => toggleMenuDisabled(m.slug)}
                />
                <span className="text-sm">{m.label}</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                  {checked ? 'OFF' : 'ON'}
                </span>
              </label>
            );
          })}
        </div>

        {/* B. ✅ 유료화(구독 필요) */}
        <h3 className="text-sm font-semibold mt-2 mb-2">유료화(구독 필요)</h3>
        <p className="text-xs text-slate-600 mb-3">
          체크된 메뉴는 <b>유료화가 적용</b>되며, <b>구독자/관리자만 활성</b>됩니다. 비구독자는 <b>보이되 비활성</b> 처리됩니다.
          (<code>settings/uploadPolicy.navigation.paid</code>)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {ALL_MENUS.map((m) => {
            const checked = paidSet.has(m.slug);
            return (
              <label
                key={m.slug}
                className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 p-3 cursor-pointer"
                title={checked ? '유료화 적용됨' : '무료'}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked}
                  onChange={() => toggleMenuPaid(m.slug)}
                />
                <span className="text-sm">{m.label}</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
                  {checked ? 'PAID' : 'FREE'}
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={saveMenuPolicy}
            disabled={savingNav}
            className={`rounded px-4 py-2 text-sm font-semibold ${savingNav ? 'bg-slate-300 text-slate-600' : 'bg-black text-white hover:opacity-90'}`}
          >
            {savingNav ? '저장 중…' : '저장'}
          </button>

          <label className="ml-4 inline-flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
            />
            디버그 패널 표시
          </label>
        </div>
      </section>

      {/* ───────────── 사용자 관리 섹션 (기존 유지) ───────────── */}
      <section>
        <h1 className="text-xl font-semibold mb-4">사용자 관리</h1>
        {fetching ? (
          <div className="text-sm text-gray-500">사용자 목록을 불러오는 중...</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Subscribed</th>
                <th className="py-2 pr-4">Start</th>
                <th className="py-2 pr-4">End</th>
                <th className="py-2 pr-4">남은일수</th>
                <th className="py-2 pr-4">Unique ID</th>
                <th className="py-2 pr-4">Joined</th>
                <th className="py-2 pr-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid} className="border-b">
                  <td className="py-2 pr-4 align-top">{r.email}</td>
                  <td className="py-2 pr-4 align-top">
                    <select
                      className="border rounded px-2 py-1 bg-white text-gray-900 dark:bg-transparent dark:text-gray-100"
                      value={r.role}
                      onChange={(e) => patchRow(r.uid, { role: e.target.value as Role })}
                    >
                      <option value="free">free</option>
                      <option value="basic">basic</option>
                      <option value="premium">premium</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="py-2 pr-4 align-top">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={!!r.isSubscribed}
                      onChange={(e) => toggleSubscribed(r, e.target.checked)}
                    />
                  </td>
                  <td className="py-2 pr-4 align-top">
                    <input
                      type="date"
                      className="border rounded px-2 py-1 bg-transparent"
                      value={tsToInputDate(r.subscriptionStartAt)}
                      onChange={(e) => changeStartDate(r, e.target.value)}
                      disabled={!r.isSubscribed}
                    />
                  </td>
                  <td className="py-2 pr-4 align-top">
                    <input
                      type="date"
                      className="border rounded px-2 py-1 bg-transparent"
                      value={tsToInputDate(r.subscriptionEndAt)}
                      onChange={(e) => changeEndDate(r, e.target.value)}
                      disabled={!r.isSubscribed}
                    />
                  </td>
                  <td className="py-2 pr-4 align-top">
                    <input
                      type="number"
                      min={0}
                      className="w-24 border rounded px-2 py-1 bg-transparent"
                      value={r.remainingDays ?? ''}
                      onChange={(e) => changeRemainingDays(r, e.target.value)}
                      disabled={!r.isSubscribed}
                    />
                  </td>
                  <td className="py-2 pr-4 align-top">{r.uniqueId ?? '-'}</td>
                  <td className="py-2 pr-4 align-top">{r.joinedAt ? tsToInputDate(r.joinedAt) : '-'}</td>
                  <td className="py-2 pr-4 align-top">
                    <button
                      onClick={() => handleSave(r)}
                      className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                      disabled={saving === r.uid}
                    >
                      {saving === r.uid ? '저장 중…' : '저장'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 디버그 패널 */}
      {showDebug && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-slate-800 dark:bg-amber-100/30 dark:text-amber-50">
          <div className="mb-2 font-semibold">디버그 패널</div>
          <div className="overflow-auto max-h-56 whitespace-pre-wrap">
            <pre>{safeStringify(dbg.uploadPolicyPayload ?? {
              navigation: { disabled: navDisabled, paid: navPaid },
              subscribeButtonEnabled: subscribeEnabled,
              updatedAt: '(serverTimestamp)',
            })}</pre>
          </div>
          {dbg.lastError && (
            <div className="mt-2 text-red-700">
              <div className="font-semibold">lastError</div>
              <pre>{safeStringify(dbg.lastError)}</pre>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
