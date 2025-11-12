'use client';

/**
 * 관리자 페이지 — 최소 변경: role 저장 반영 문제 수정
 * ---------------------------------------------------
 * 변경 포인트
 * 1) 사용자 목록: getDocs → onSnapshot 실시간 구독 (저장 직후 UI 갱신)
 * 2) handleSave 이후, 저장된 payload로 rows 내부도 패치(보정)
 * 3) role은 'free'|'basic'|'premium'|'admin' (소문자)만 허용
 * 4) 기존 공지/메뉴관리 UI/로직 유지
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  getDocs,
  updateDoc,
  addDoc,
  deleteDoc,
  doc,
  Timestamp,
  onSnapshot,
  setDoc,
  serverTimestamp,
  getDoc,
  orderBy,
  query,
  limit,
} from 'firebase/firestore';
import { getAuth, getIdTokenResult, onAuthStateChanged } from 'firebase/auth';
import Link from 'next/link';

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
  subscriptionTier?: 'free'|'basic'|'premium';
}

type NoticeDoc = {
  id: string;
  title: string;
  content_md?: string;
  pinned?: boolean;
  published?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

const norm = (v: string) => String(v || '').trim().toLowerCase();

function kstToday(): Date {
  const now = new Date();
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
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
function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86400000);
}
function clampEndAfterStart(start: Date | null, end: Date | null) {
  if (!start || !end) return end;
  return end.getTime() < start.getTime() ? start : end;
}
function calcRemainingDaysFromEnd(end: Timestamp | null | undefined) {
  if (!end) return null;
  const e = end.toDate();
  const eu = new Date(Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()));
  const base = kstToday();
  const diff = eu.getTime() - base.getTime();
  const n = Math.ceil(diff / 86400000);
  return n < 0 ? 0 : n;
}

const ALL_MENUS = [
  { slug: 'convert',         label: 'Data Convert', href: '/convert' },
  { slug: 'compare',         label: 'Compare',      href: '/compare' },
  { slug: 'pdf-tool',        label: 'PDF Tool',     href: '/pdf-tool' },
  { slug: 'pattern-editor',  label: 'Pattern Editor', href: '/pattern-editor' },
  { slug: 'random',          label: 'Random',       href: '/random' },
  { slug: 'admin',           label: 'Admin',        href: '/admin', adminOnly: true },
];

type Tier = 'free' | 'basic' | 'premium';

export default function AdminPage() {
  // 내 계정이 admin인지 판별
  const [roleLoading, setRoleLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setRoleLoading(true);
      try {
        if (!u) { setIsAdmin(false); return; }
        try { await getIdTokenResult(u, true); } catch {}
        const us = await getDoc(doc(db, 'users', u.uid));
        const r = norm((us.exists() ? (us.data() as any)?.role : 'user') ?? 'user');
        setIsAdmin(r === 'admin');
      } finally {
        setRoleLoading(false);
      }
    });
    return () => unsub();
  }, []);

  /* ───────────────── 공지 관리(기존 유지) ───────────────── */

  const [noticeId, setNoticeId] = useState<string | null>(null);
  const [nTitle, setNTitle] = useState('');
  const [nContent, setNContent] = useState('');
  const [nPinned, setNPinned] = useState(false);
  const [nPublished, setNPublished] = useState(true);
  const [nSaving, setNSaving] = useState(false);

  const [noticeRows, setNoticeRows] = useState<NoticeDoc[]>([]);
  const [nLoading, setNLoading] = useState(false);
  const [nError, setNError] = useState<string | null>(null);

  useEffect(() => {
    if (roleLoading || !isAdmin) return;
    setNLoading(true);
    const qy = query(collection(db, 'notice'), orderBy('pinned', 'desc'), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: NoticeDoc[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
        setNoticeRows(rows); setNLoading(false); setNError(null);
      },
      (err) => { setNError(err?.message || '공지 목록 로드 실패'); setNLoading(false); }
    );
    return () => unsub();
  }, [roleLoading, isAdmin]);

  const resetNoticeForm = () => {
    setNoticeId(null); setNTitle(''); setNContent(''); setNPinned(false); setNPublished(true);
  };
  const loadNoticeToForm = (row: NoticeDoc) => {
    setNoticeId(row.id);
    setNTitle(row.title || '');
    setNContent(row.content_md || '');
    setNPinned(!!row.pinned);
    setNPublished(row.published !== false);
  };
  const saveNotice = async () => {
    if (!isAdmin) return alert('권한이 없습니다.');
    if (!nTitle.trim()) return alert('제목을 입력하세요.');
    setNSaving(true);
    try {
      if (!noticeId) {
        await addDoc(collection(db, 'notice'), {
          title: nTitle.trim(),
          content_md: nContent,
          pinned: !!nPinned,
          published: !!nPublished,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        resetNoticeForm(); alert('공지사항이 등록되었습니다.');
      } else {
        await updateDoc(doc(db, 'notice', noticeId), {
          title: nTitle.trim(),
          content_md: nContent,
          pinned: !!nPinned,
          published: !!nPublished,
          updatedAt: serverTimestamp(),
        });
        alert('공지사항이 수정되었습니다.');
      }
    } catch (e:any) {
      alert(`저장 중 오류: ${e?.code || e?.message || '알 수 없는 오류'}`);
    } finally { setNSaving(false); }
  };
  const deleteNotice = async () => {
    if (!isAdmin || !noticeId) return;
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'notice', noticeId));
    resetNoticeForm(); alert('삭제되었습니다.');
  };
  const fmtDate = (ts?: Timestamp) => {
    if (!ts) return '';
    const d = ts.toDate();
    const yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0'), mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  };

  /* ───────────────── 메뉴 관리(기존 유지 + tiers 저장) ───────────────── */

  const [navDisabled, setNavDisabled] = useState<string[]>([]);
  const [navPaid, setNavPaid] = useState<string[]>([]);
  const [navTiers, setNavTiers] = useState<Record<string, Tier>>({});
  const [subscribeEnabled, setSubscribeEnabled] = useState<boolean>(true);
  const [savingNav, setSavingNav] = useState(false);

  useEffect(() => {
    if (roleLoading || !isAdmin) return;
    const ref = doc(db, 'settings', 'uploadPolicy');
    const unsub = onSnapshot(ref, (snap) => {
      const data = (snap.data() as any) || {};
      const nav = data.navigation ?? {};
      setNavDisabled(Array.isArray(nav.disabled) ? nav.disabled : []);
      setNavPaid(Array.isArray(nav.paid) ? nav.paid : []);
      // tiers 우선
      const t = (nav.tiers ?? {}) as Record<string, Tier>;
      const next: Record<string, Tier> = {};
      ALL_MENUS.forEach(m => { next[m.slug] = 'free'; });
      Object.keys(t).forEach(k => {
        const v = norm(String(t[k]));
        next[k] = v === 'premium' ? 'premium' : v === 'basic' ? 'basic' : 'free';
      });
      // tiers 없던 과거 데이터 보정: paid → basic
      if (!nav.tiers && Array.isArray(nav.paid)) {
        nav.paid.forEach((slug: string) => { next[slug] = 'basic'; });
      }
      setNavTiers(next);
      setSubscribeEnabled(data.subscribeButtonEnabled === undefined ? true : !!data.subscribeButtonEnabled);
    });
    return () => unsub();
  }, [roleLoading, isAdmin]);

  const disabledSet = useMemo(() => new Set(navDisabled), [navDisabled]);

  const saveMenuPolicy = async () => {
    if (!isAdmin) return alert('권한이 없습니다.');
    setSavingNav(true);
    try {
      const paidFromTiers = Object.entries(navTiers).filter(([,t]) => t !== 'free').map(([slug]) => slug);
      await setDoc(
        doc(db, 'settings', 'uploadPolicy'),
        {
          navigation: { disabled: navDisabled, paid: paidFromTiers, tiers: navTiers },
          subscribeButtonEnabled: subscribeEnabled,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert('메뉴 정책이 저장되었습니다.');
    } catch (e:any) {
      alert(`저장 중 오류: ${e?.code || e?.message || '알 수 없는 오류'}`);
    } finally { setSavingNav(false); }
  };

  /* ───────────────── 사용자 관리(핵심: 실시간 구독 + 저장 후 패치) ───────────────── */

  const [rows, setRows] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (roleLoading || !isAdmin) return;
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list: UserRow[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        const endTs: Timestamp | null = data.subscriptionEndAt ?? null;
        list.push({
          uid: d.id,
          email: data.email ?? '',
          role: (norm(data.role ?? 'free') as Role),
          uniqueId: data.uniqueId ?? null,
          joinedAt: data.joinedAt ?? null,
          isSubscribed: data.isSubscribed ?? false,
          subscriptionStartAt: data.subscriptionStartAt ?? null,
          subscriptionEndAt: endTs,
          remainingDays: calcRemainingDaysFromEnd(endTs),
          subscriptionTier: (norm(data.subscriptionTier ?? 'free') as 'free'|'basic'|'premium'),
        });
      });
      // 정렬 유지(이메일)
      list.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      setRows(list);
    });
    return () => unsub();
  }, [roleLoading, isAdmin]);

  const patchRow = (uid: string, patch: Partial<UserRow>) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const toggleSubscribed = (r: UserRow, checked: boolean) => {
    if (!checked) {
      patchRow(r.uid, {
        isSubscribed: false,
        subscriptionStartAt: null,
        subscriptionEndAt: null,
        remainingDays: null,
        subscriptionTier: 'free',
      });
      return;
    }
    const startDate = r.subscriptionStartAt?.toDate() ?? kstToday();
    const endDate = r.subscriptionEndAt?.toDate() ?? addDays(startDate, 30);
    const endTs = clampEndAfterStart(startDate, endDate);
    patchRow(r.uid, {
      isSubscribed: true,
      subscriptionStartAt: Timestamp.fromDate(startDate),
      subscriptionEndAt: endTs ? Timestamp.fromDate(endTs) : null,
      remainingDays: calcRemainingDaysFromEnd(endTs ? Timestamp.fromDate(endTs) : null),
      subscriptionTier: (r.role === 'premium' || r.role === 'admin') ? 'premium' : 'basic',
    });
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
      // role 문자열 정규화(대문자 입력 방지)
      const safeRole = (['free','basic','premium','admin'].includes(row.role) ? row.role : 'free') as Role;

      // 날짜 정합성
      let startTs: Timestamp | null = row.subscriptionStartAt ?? null;
      let endTs: Timestamp | null = row.subscriptionEndAt ?? null;
      let isSubscribed = !!row.isSubscribed;
      let tier: 'free'|'basic'|'premium' = row.subscriptionTier ?? 'free';

      if (!isSubscribed) {
        startTs = null;
        endTs = null;
        tier = 'free';
      } else {
        const startD = startTs?.toDate() ?? kstToday();
        const endD = endTs?.toDate() ?? addDays(startD, 30);
        const clampedEnd = clampEndAfterStart(startD, endD);
        startTs = Timestamp.fromDate(startD);
        endTs = clampedEnd ? Timestamp.fromDate(clampedEnd) : null;
        // role이 premium|admin이면 tier도 premium로 동기화, basic이면 basic
        tier = (safeRole === 'premium' || safeRole === 'admin') ? 'premium' : 'basic';
      }

      const ref = doc(db, 'users', row.uid);
      await updateDoc(ref, {
        role: safeRole,
        isSubscribed,
        subscriptionStartAt: startTs,
        subscriptionEndAt: endTs,
        subscriptionTier: tier,
      });

      // 저장 성공 직후 로컬 반영(스냅샷 대기 없이 즉시 반영)
      patchRow(row.uid, {
        role: safeRole,
        isSubscribed,
        subscriptionStartAt: startTs,
        subscriptionEndAt: endTs,
        subscriptionTier: tier,
      });

      alert('저장되었습니다.');
    } catch (e:any) {
      alert(`저장 중 오류: ${e?.code || e?.message || '알 수 없는 오류'}`);
    } finally {
      setSaving(null);
    }
  };

  /* ───────────── 렌더 ───────────── */

  if (roleLoading) return <main className="p-6 text-sm text-gray-500">로딩 중...</main>;
  if (!isAdmin)
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-4">관리자 페이지</h1>
        <p className="text-red-600 dark:text-red-400">⛔ 관리자 권한이 없습니다.</p>
      </main>
    );

  return (
    <main className="p-6 space-y-6">
      {/* 공지 */}
      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-bold mb-2">공지사항 관리</h2>

        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center gap-2">
            <label className="w-24 text-sm">상태</label>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">{noticeId ? '수정' : '새 글'}</span>
            {noticeId && (
              <button className="ml-2 text-xs px-2 py-1 rounded border" onClick={resetNoticeForm} type="button">
                새 글
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="w-24 text-sm">제목</label>
            <input
              className="flex-1 border rounded px-2 py-1 bg-white dark:bg-transparent"
              value={nTitle}
              onChange={(e) => setNTitle(e.target.value)}
              placeholder="공지 제목"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">본문(마크다운)</label>
            <textarea
              className="w-full min-h-[160px] border rounded px-2 py-2 bg-white dark:bg-transparent"
              value={nContent}
              onChange={(e) => setNContent(e.target.value)}
              placeholder="내용"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nPinned} onChange={(e) => setNPinned(e.target.checked)} />
              상단 고정
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nPublished} onChange={(e) => setNPublished(e.target.checked)} />
              게시
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={saveNotice}
              disabled={nSaving}
              className={`rounded px-4 py-2 text-sm font-semibold ${nSaving ? 'bg-slate-300' : 'bg-black text-white hover:opacity-90'}`}
            >
              {noticeId ? '수정 저장' : '등록'}
            </button>

            {noticeId && (
              <button
                onClick={deleteNotice}
                type="button"
                className="rounded px-4 py-2 text-sm font-semibold border border-red-500 text-red-600"
              >
                삭제
              </button>
            )}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">최근 공지(최대 50)</h3>
            {nLoading && <span className="text-xs text-slate-500">불러오는 중…</span>}
          </div>
          {nError && <p className="text-xs text-red-600">{nError}</p>}
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/40 text-left">
                  <th className="py-2 px-3 w-14">고정</th>
                  <th className="py-2 px-3">제목</th>
                  <th className="py-2 px-3 w-24">게시</th>
                  <th className="py-2 px-3 w-40">작성일</th>
                  <th className="py-2 px-3 w-40">수정일</th>
                </tr>
              </thead>
              <tbody>
                {noticeRows.map((n) => (
                  <tr key={n.id} className="border-t hover:bg-slate-50/60 dark:hover:bg-slate-900/30 cursor-pointer" onClick={() => loadNoticeToForm(n)}>
                    <td className="py-2 px-3">{n.pinned ? '📌' : ''}</td>
                    <td className="py-2 px-3 truncate">{n.title}</td>
                    <td className="py-2 px-3">{n.published === false ? '숨김' : '게시'}</td>
                    <td className="py-2 px-3 text-xs">{fmtDate(n.createdAt)}</td>
                    <td className="py-2 px-3 text-xs">{fmtDate(n.updatedAt)}</td>
                  </tr>
                ))}
                {noticeRows.length === 0 && !nLoading && (
                  <tr><td className="py-4 px-3 text-center text-xs text-slate-500" colSpan={5}>등록된 공지가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 메뉴 관리(기존 유지) */}
      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-bold mb-2">메뉴 관리</h2>

        <div className="flex items-center gap-3 mb-4">
          <span className="font-medium">구독 버튼 활성화</span>
          <button
            type="button"
            className={`px-3 py-1 rounded border ${subscribeEnabled ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
            onClick={() => setSubscribeEnabled(v => !v)}
            aria-pressed={subscribeEnabled}
          >
            {subscribeEnabled ? '활성화' : '비활성화'}
          </button>
        </div>

        <h3 className="text-sm font-semibold mt-2 mb-2">비활성화(OFF)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {ALL_MENUS.map((m) => {
            const checked = disabledSet.has(m.slug);
            return (
              <label key={m.slug} className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked}
                  onChange={() => setNavDisabled((prev) => {
                    const s = new Set(prev);
                    s.has(m.slug) ? s.delete(m.slug) : s.add(m.slug);
                    return Array.from(s);
                  })}
                />
                <span className="text-sm">{m.label}</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                  {checked ? 'OFF' : 'ON'}
                </span>
              </label>
            );
          })}
        </div>

        <h3 className="text-sm font-semibold mt-2 mb-2">유료화(단일 선택)</h3>
        <p className="text-xs text-slate-600 mb-3">메뉴별로 무료/Basic/Premium 중 하나를 선택합니다.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {ALL_MENUS.map((m) => {
            const curr = navTiers[m.slug] ?? 'free';
            const setTier = (t: Tier) => setNavTiers(prev => ({ ...prev, [m.slug]: t }));
            return (
              <div key={m.slug} className="rounded-lg border p-3">
                <div className="text-sm font-medium mb-2 flex items-center gap-2">
                  <span>{m.label}</span>
                  {curr !== 'free' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
                      {curr === 'premium' ? 'Premium' : 'Basic'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name={`tier-${m.slug}`} checked={curr === 'free'} onChange={() => setTier('free')} />
                    무료
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name={`tier-${m.slug}`} checked={curr === 'basic'} onChange={() => setTier('basic')} />
                    Basic
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name={`tier-${m.slug}`} checked={curr === 'premium'} onChange={() => setTier('premium')} />
                    Premium
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={saveMenuPolicy}
            disabled={savingNav}
            className={`rounded px-4 py-2 text-sm font-semibold ${savingNav ? 'bg-slate-300' : 'bg-black text-white hover:opacity-90'}`}
          >
            {savingNav ? '저장 중…' : '저장'}
          </button>
          <Link href="/admin" className="text-sm opacity-80 hover:underline">← 관리자 홈으로</Link>
        </div>
      </section>

      {/* 사용자 관리 */}
      <section>
        <h1 className="text-xl font-semibold mb-4">사용자 관리</h1>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Subscribed</th>
              <th className="py-2 pr-4">Start</th>
              <th className="py-2 pr-4">End</th>
              <th className="py-2 pr-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid} className="border-b">
                <td className="py-2 pr-4 align-top">{r.email}</td>
                <td className="py-2 pr-4 align-top">
                  <select
                    className="border rounded px-2 py-1 bg-white dark:bg-transparent"
                    value={r.role}
                    onChange={(e) => {
                      const v = norm(e.target.value) as Role;
                      const safe: Role = (['free','basic','premium','admin'].includes(v) ? v : 'free') as Role;
                      // role 변경 시 tier 힌트도 보정(표시만)
                      const nextTier: 'free'|'basic'|'premium' =
                        safe === 'premium' || safe === 'admin' ? 'premium' :
                        safe === 'basic' ? 'basic' : 'free';
                      patchRow(r.uid, { role: safe, subscriptionTier: nextTier });
                    }}
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
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (!checked) {
                        patchRow(r.uid, {
                          isSubscribed: false,
                          subscriptionStartAt: null,
                          subscriptionEndAt: null,
                          subscriptionTier: 'free',
                        });
                      } else {
                        const startDate = r.subscriptionStartAt?.toDate() ?? kstToday();
                        const endDate = r.subscriptionEndAt?.toDate() ?? addDays(startDate, 30);
                        const clamped = clampEndAfterStart(startDate, endDate);
                        patchRow(r.uid, {
                          isSubscribed: true,
                          subscriptionStartAt: Timestamp.fromDate(startDate),
                          subscriptionEndAt: clamped ? Timestamp.fromDate(clamped) : null,
                          subscriptionTier: (r.role === 'premium' || r.role === 'admin') ? 'premium' : 'basic',
                        });
                      }
                    }}
                  />
                </td>
                <td className="py-2 pr-4 align-top">
                  <input
                    type="date"
                    className="border rounded px-2 py-1 bg-transparent"
                    value={tsToInputDate(r.subscriptionStartAt)}
                    onChange={(e) => {
                      const newStart = inputDateToDate(e.target.value);
                      const currEnd = r.subscriptionEndAt?.toDate() ?? null;
                      const clampedEnd = clampEndAfterStart(newStart, currEnd);
                      patchRow(r.uid, {
                        subscriptionStartAt: newStart ? Timestamp.fromDate(newStart) : null,
                        subscriptionEndAt: clampedEnd ? Timestamp.fromDate(clampedEnd) : null,
                      });
                    }}
                    disabled={!r.isSubscribed}
                  />
                </td>
                <td className="py-2 pr-4 align-top">
                  <input
                    type="date"
                    className="border rounded px-2 py-1 bg-transparent"
                    value={tsToInputDate(r.subscriptionEndAt)}
                    onChange={(e) => {
                      const newEnd = inputDateToDate(e.target.value);
                      const start = r.subscriptionStartAt?.toDate() ?? null;
                      const clampedEnd = clampEndAfterStart(start, newEnd);
                      patchRow(r.uid, {
                        subscriptionEndAt: clampedEnd ? Timestamp.fromDate(clampedEnd) : null,
                      });
                    }}
                    disabled={!r.isSubscribed}
                  />
                </td>
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
      </section>
    </main>
  );
}
