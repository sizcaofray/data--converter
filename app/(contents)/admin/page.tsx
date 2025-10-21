'use client';

/**
 * 관리자 - 사용자 관리 + 메뉴 비활성화 관리 (디버그 로그 강화판)
 * - 어디서 막히는지 단계별로 확인할 수 있도록 콘솔 로그를 추가했습니다.
 * - 저장 직전 사용자 권한(UID/이메일/클레임), users/{uid}.role, payload, 경로, Firestore SDK 상세 에러를 모두 출력합니다.
 */

import { useEffect, useState, useMemo } from 'react';
import { useUser } from '@/contexts/UserContext';
import { db } from '@/lib/firebase/firebase';
import {
  collection, getDocs, updateDoc, doc, Timestamp,
  onSnapshot, setDoc, serverTimestamp, getDoc,
  setLogLevel
} from 'firebase/firestore';
import { getAuth, getIdTokenResult } from 'firebase/auth';

// 🔎 Firestore 내부 로그까지 보고 싶다면 주석 해제
setLogLevel('debug');

/** =========================
 *  기존 타입/유틸 (원본 유지)
 * ========================= */
type Role = 'free' | 'basic' | 'premium' | 'admin';

interface UserRow {
  uid: string; email: string; role: Role;
  uniqueId?: string | null; joinedAt?: Timestamp | null;
  isSubscribed?: boolean; subscriptionStartAt?: Timestamp | null; subscriptionEndAt?: Timestamp | null;
  remainingDays?: number | null;
}

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

/** =========================
 *  사이드바 메뉴 목록 (필요 시 slug만 맞추세요)
 * ========================= */
type MenuConfig = { slug: string; label: string };
const ALL_MENUS: MenuConfig[] = [
  { slug: 'convert', label: 'Data Convert' },
  { slug: 'compare', label: 'Compare' },
  { slug: 'random',  label: 'Random' },
  { slug: 'admin',   label: 'Admin' },
];

/** =========================
 *  안전 유틸: Firestore 400 방지
 * ========================= */
function sanitizeSlugArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map(v => (typeof v === 'string' ? v : String(v ?? '').trim()))
    .filter(v => v.length > 0);
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

// 안전 stringify (순환참조 방지)
function safeStringify(o: any) {
  const seen = new WeakSet();
  return JSON.stringify(o, (k, v) => {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
    }
    return v;
  }, 2);
}

export default function AdminPage() {
  const { role: myRole, loading } = useUser();

  // ===== [A] 메뉴 관리 상태 =====
  const [navDisabled, setNavDisabled] = useState<string[]>([]);
  const [savingNav, setSavingNav] = useState(false);

  useEffect(() => {
    if (loading || myRole !== 'admin') return;
    const ref = doc(db, 'settings', 'uploadPolicy');
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as any | undefined;
      const arr = Array.isArray(data?.navigation?.disabled) ? data?.navigation?.disabled : data?.navigation?.disabled === true ? ['__all__'] : [];
      // ↑ 규칙이 bool/array 둘 다 허용되므로 bool(true)이면 임시로 ['__all__']로 가정표시
      const cleaned = sanitizeSlugArray(arr);
      console.log('[ADMIN DEBUG] onSnapshot uploadPolicy:', data);
      setNavDisabled(cleaned);
    }, (err) => {
      console.error('[ADMIN DEBUG] onSnapshot(uploadPolicy) ERROR:', err);
    });
    return () => unsub();
  }, [loading, myRole]);

  const disabledSet = useMemo(() => new Set(navDisabled), [navDisabled]);

  const toggleMenu = (slug: string) => {
    setNavDisabled(prev => {
      const s = new Set(prev);
      s.has(slug) ? s.delete(slug) : s.add(slug);
      return Array.from(s);
    });
  };

  // ✅ 핵심: 저장 직전/직후 모든 상태를 기록
  const saveMenuDisabled = async () => {
    setSavingNav(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      console.log('[ADMIN DEBUG] saveMenuDisabled: START');
      console.log('[ADMIN DEBUG] myRole(from context):', myRole);

      if (!user) {
        console.warn('[ADMIN DEBUG] No currentUser (미로그인)');
        alert('로그인이 필요합니다.');
        return;
      }

      const tokenRes = await getIdTokenResult(user, true);
      console.log('[ADMIN DEBUG] auth uid/email:', user.uid, user.email);
      console.log('[ADMIN DEBUG] token claims:', safeStringify(tokenRes.claims));

      // rules에서 isAdmin()은 users/{uid}.role == 'admin' 만 봅니다.
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      console.log('[ADMIN DEBUG] users/{uid} exists?:', userDoc.exists());
      console.log('[ADMIN DEBUG] users/{uid}.data():', userDoc.data());
      const roleOnDoc = userDoc.data()?.role;
      console.log('[ADMIN DEBUG] users/{uid}.role:', roleOnDoc);

      // payload 구성 & 로그
      const cleaned = sanitizeSlugArray(navDisabled);
      const payload = pruneUndefined({
        navigation: { disabled: cleaned },   // 문자열 배열 기준
        updatedAt: serverTimestamp(),
      });
      console.log('[ADMIN DEBUG] uploadPolicy PATH:', 'settings/uploadPolicy');
      console.log('[ADMIN DEBUG] payload before setDoc:', payload);

      // 실제 쓰기
      const ref = doc(db, 'settings', 'uploadPolicy');
      await setDoc(ref, payload, { merge: true });

      console.log('[ADMIN DEBUG] setDoc OK');
      alert('메뉴 설정이 저장되었습니다.');
    } catch (e: any) {
      // Firestore SDK 에러 상세 출력
      console.error('[ADMIN NAV SAVE][ERR] code:', e?.code, 'name:', e?.name);
      console.error('[ADMIN NAV SAVE][ERR] message:', e?.message);
      console.error('[ADMIN NAV SAVE][ERR] customData:', safeStringify(e?.customData));
      console.error('[ADMIN NAV SAVE][ERR] full:', e);
      alert(`메뉴 저장 중 오류: ${e?.code || e?.message || '알 수 없는 오류'}`);
    } finally {
      setSavingNav(false);
      console.log('[ADMIN DEBUG] saveMenuDisabled: END');
    }
  };

  // ===== [B] 기존 유저관리 =====
  const [rows, setRows] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (loading || myRole !== 'admin') return;
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
      } finally { setFetching(false); }
    })();
  }, [loading, myRole]);

  const patchRow = (uid: string, patch: Partial<UserRow>) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const toggleSubscribed = (r: UserRow, checked: boolean) => {
    if (!checked) {
      patchRow(r.uid, {
        isSubscribed: false,
        subscriptionStartAt: null,
        subscriptionEndAt: null,
        remainingDays: null
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
      remainingDays: calcRemainingDaysFromEnd(endTs)
    });
  };

  const changeEndDate = (r: UserRow, input: string) => {
    const newEnd = inputDateToDate(input);
    const start = r.subscriptionStartAt?.toDate() ?? null;
    const clampedEnd = clampEndAfterStart(start, newEnd);
    const endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
    patchRow(r.uid, {
      subscriptionEndAt: endTs,
      remainingDays: calcRemainingDaysFromEnd(endTs)
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
        startTs = null; endTs = null;
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
      console.error('[ADMIN SAVE][ERR]', e?.code, e?.message, e);
      alert(`저장 중 오류: ${e?.code || e?.message || '알 수 없는 오류'}`);
    } finally { setSaving(null); }
  };

  if (loading) return <main className="p-6 text-sm text-gray-500">로딩 중...</main>;
  if (myRole !== 'admin') return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">관리자 페이지</h1>
      <p className="text-red-600 dark:text-red-400">⛔ 관리자 권한이 없습니다.</p>
    </main>
  );

  return (
    <main className="p-6 space-y-6">
      {/* 메뉴 관리 섹션 */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <h2 className="text-lg font-bold mb-2">메뉴 관리 (비활성화)</h2>
        <p className="text-sm text-slate-600 mb-4">
          체크된 메뉴는 사이드바에서 <b>보여지되 클릭이 차단</b>됩니다. (<code>settings/uploadPolicy.navigation.disabled: string[]</code>)
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
                  onChange={() => toggleMenu(m.slug)}
                />
                <span className="text-sm">{m.label}</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                  {checked ? 'OFF' : 'ON'}
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={saveMenuDisabled}
            disabled={savingNav}
            className={`rounded px-4 py-2 text-sm font-semibold ${
              savingNav ? 'bg-slate-300 text-slate-600' : 'bg-black text-white hover:opacity-90'
            }`}
          >
            {savingNav ? '저장 중…' : '저장'}
          </button>
          <div className="text-xs text-slate-500 self-center">
            문서: <code>settings/uploadPolicy</code> / 필드: <code>navigation.disabled: string[]</code>
          </div>
        </div>
      </section>

      {/* 사용자 관리 섹션 */}
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
    </main>
  );
}
