'use client';

/**
 * 관리자 페이지
 * -----------------------------------------------------------------------------
 * 변경 요약:
 *  - [섹션 2] "유료화(구독 필요)" 체크박스를
 *    ▶ 무료/Basic/Premium '라디오 단일선택' UI로 변경 (메뉴별 1개만 선택)
 *  - Firestore uploadPolicy에 navigation.tiers 맵을 우선 사용
 *    ▶ tiers가 없으면 기존 navigation.paid 배열을 basic으로 간주(하위 호환)
 *  - 저장 시 navigation.tiers를 저장하고, paid 배열은 tiers에서 자동 생성해 함께 저장
 *
 * 기존 섹션:
 *  - 공지 관리 / 사용자 관리 / 비활성화 / 구독버튼 토글 등은 그대로 유지
 */

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
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

/* ========================= 공용 타입/유틸 ========================= */

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

/** 공지 타입 */
type NoticeDoc = {
  id: string;
  title: string;
  content_md?: string;
  pinned?: boolean;
  published?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

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
const norm = (v: string) => String(v || '').trim().toLowerCase();

/* ========================= 컴포넌트 ========================= */

export default function AdminPage() {
  const { role: myRoleFromContext, loading: userCtxLoading } = useUser();

  // ── [A] 관리자 판정 (users/{uid}.role === 'admin')
  const [usersDocRole, setUsersDocRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setRoleLoading(true);
      try {
        if (!u) {
          setUsersDocRole(null);
          return;
        }
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

  /* ========== [섹션 1] 공지사항 관리(작성/수정/삭제 + 목록) ========== */

  // 폼 상태
  const [noticeId, setNoticeId] = useState<string | null>(null);            // null이면 새 글
  const [nTitle, setNTitle] = useState('');
  const [nContent, setNContent] = useState('');
  const [nPinned, setNPinned] = useState(false);
  const [nPublished, setNPublished] = useState(true);
  const [nSaving, setNSaving] = useState(false);

  // 목록 상태
  const [noticeRows, setNoticeRows] = useState<NoticeDoc[]>([]);
  const [nLoading, setNLoading] = useState(false);
  const [nError, setNError] = useState<string | null>(null);

  // 공지 목록 실시간 구독 (pinned desc, createdAt desc, 최대 50)
  useEffect(() => {
    if (roleLoading || !isAdminRole) return;
    setNLoading(true);
    const qy = query(
      collection(db, 'notice'),
      orderBy('pinned', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: NoticeDoc[] = [];
        snap.forEach((d) => {
          const data = d.data() as Omit<NoticeDoc, 'id'>;
          rows.push({ id: d.id, ...data });
        });
        setNoticeRows(rows);
        setNLoading(false);
        setNError(null);
      },
      (err) => {
        setNError(err?.message || '공지 목록 로드 실패');
        setNLoading(false);
      }
    );
    return () => unsub();
  }, [roleLoading, isAdminRole]);

  /** 폼 초기화(새 글) */
  const resetNoticeForm = () => {
    setNoticeId(null);
    setNTitle('');
    setNContent('');
    setNPinned(false);
    setNPublished(true);
  };

  /** 목록 클릭 → 폼에 로드 */
  const loadNoticeToForm = (row: NoticeDoc) => {
    setNoticeId(row.id);
    setNTitle(row.title || '');
    setNContent(row.content_md || '');
    setNPinned(!!row.pinned);
    setNPublished(row.published !== false);
  };

  /** 저장(새 글: addDoc / 수정: updateDoc) */
  const saveNotice = async () => {
    if (!isAdminRole) {
      alert('권한이 없습니다.');
      return;
    }
    if (!nTitle.trim()) {
      alert('제목을 입력하세요.');
      return;
    }

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
        resetNoticeForm();
        alert('공지사항이 등록되었습니다.');
      } else {
        const ref = doc(db, 'notice', noticeId);
        await updateDoc(ref, {
          title: nTitle.trim(),
          content_md: nContent,
          pinned: !!nPinned,
          published: !!nPublished,
          updatedAt: serverTimestamp(),
        });
        alert('공지사항이 수정되었습니다.');
      }
    } catch (e: any) {
      alert(`저장 중 오류: ${e?.code || e?.message || '알 수 없는 오류'}`);
    } finally {
      setNSaving(false);
    }
  };

  /** 삭제 */
  const deleteNotice = async () => {
    if (!isAdminRole || !noticeId) return;
    if (!confirm('정말로 이 공지사항을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'notice', noticeId));
      resetNoticeForm();
      alert('삭제되었습니다.');
    } catch (e: any) {
      alert(`삭제 중 오류: ${e?.code || e?.message || '알 수 없는 오류'}`);
    }
  };

  /** 날짜 표기 유틸 */
  const fmtDate = (ts?: Timestamp) => {
    if (!ts) return '';
    const d = ts.toDate();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  };

  /* ========== [섹션 2] 메뉴 관리 + 전역 구독 버튼 + 유료화(라디오로 변경) ========== */

  const [navDisabled, setNavDisabled] = useState<string[]>([]);          // 비활성 목록(기존)
  const [navPaid, setNavPaid] = useState<string[]>([]);                  // 하위 호환(표시/디버그용)
  const [subscribeEnabled, setSubscribeEnabled] = useState<boolean>(true); // 구독버튼 전역 토글(기존)
  const [savingNav, setSavingNav] = useState(false);

  // ✅ 신규: 메뉴별 티어 맵 (free/basic/premium)
  type Tier = 'free' | 'basic' | 'premium';
  const [navTiers, setNavTiers] = useState<Record<string, Tier>>({});

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
        const arrPaid = Array.isArray(data?.navigation?.paid) ? data.navigation.paid : [];
        const tiersMap = (data?.navigation?.tiers ?? {}) as Record<string, Tier>;

        // 기존 필드 반영
        setNavDisabled(sanitizeSlugArray(arrDisabled));
        setNavPaid(sanitizeSlugArray(arrPaid));

        // ✅ tiers 우선 사용, 없으면 paid를 basic으로 간주하여 초기화
        const next: Record<string, Tier> = {};
        // 1) 모든 메뉴에 대해 기본값 free
        ALL_MENUS.forEach(m => { next[m.slug] = 'free'; });
        // 2) tiers 맵 반영
        Object.keys(tiersMap).forEach((k) => {
          const key = String(k).trim();
          const v = String(tiersMap[k]).toLowerCase();
          next[key] = (v === 'basic' || v === 'premium') ? (v as Tier) : 'free';
        });
        // 3) tiers 정보가 전혀 없을 때 paid 배열을 basic으로 간주(하위 호환)
        if (!data?.navigation?.tiers) {
          sanitizeSlugArray(arrPaid).forEach(slug => { next[slug] = 'basic'; });
        }
        setNavTiers(next);

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

  /** 디버그 페이로드 (저장 직전 확인용) */
  const dumpPolicyPayload = () => {
    // paid 배열은 tiers에서 재생성: free 제외
    const paidFromTiers = Object.entries(navTiers)
      .filter(([, t]) => t !== 'free')
      .map(([slug]) => slug);

    const payload = pruneUndefined({
      navigation: {
        disabled: sanitizeSlugArray(navDisabled),
        paid: paidFromTiers,                 // ✅ 하위 호환용으로 함께 저장
        tiers: navTiers,                     // ✅ 신규 저장 포맷
      },
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

      // 저장용 paid 배열은 tiers에서 파생
      const paidFromTiers = Object.entries(navTiers)
        .filter(([, t]) => t !== 'free')
        .map(([slug]) => slug);

      await setDoc(
        ref,
        {
          navigation: {
            disabled: sanitizeSlugArray(navDisabled),
            paid: paidFromTiers,     // ✅ 하위 호환 유지
            tiers: navTiers,         // ✅ 신규 포맷
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

  /* ========== [섹션 3] 사용자 관리(기존 유지) ========== */

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
    const endDate = r.subscriptionEndAt?.toDate() ?? kstTodayPlusDays(30);
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

  /* ========================= 렌더 ========================= */

  if (userCtxLoading || roleLoading)
    return <main className="p-6 text-sm text-gray-500">로딩 중...</main>;

  if (!isAdminRole)
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-4">관리자 페이지</h1>
        <p className="text-red-600 dark:text-red-400">
          ⛔ 관리자 권한이 없습니다. (<code>users/&#123;uid&#125;.role</code> 기준)
        </p>
      </main>
    );

  return (
    <main className="p-6 space-y-6">
      {/* ───────────── [섹션 1] 공지사항 관리 ───────────── */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <h2 className="text-lg font-bold mb-2">공지사항 관리</h2>
        <p className="text-xs text-slate-600 mb-4">
          제목/본문(마크다운)·고정·게시 여부를 설정해 저장합니다. 생성 시 <code>createdAt</code>, 수정 시 <code>updatedAt</code>가 자동 기록됩니다.
        </p>

        {/* 폼 */}
        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center gap-2">
            <label className="w-24 text-sm">상태</label>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
              {noticeId ? '수정' : '새 글'}
            </span>
            {noticeId && (
              <button
                className="ml-2 text-xs px-2 py-1 rounded border hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={resetNoticeForm}
                type="button"
                title="새 글 작성으로 전환"
              >
                새 글
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="w-24 text-sm">제목</label>
            <input
              className="flex-1 border rounded px-2 py-1 bg-white text-gray-900 dark:bg-transparent dark:text-gray-100"
              value={nTitle}
              onChange={(e) => setNTitle(e.target.value)}
              placeholder="공지 제목을 입력하세요"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">본문(마크다운)</label>
            <textarea
              className="w-full min-h-[160px] border rounded px-2 py-2 bg-white text-gray-900 dark:bg-transparent dark:text-gray-100"
              value={nContent}
              onChange={(e) => setNContent(e.target.value)}
              placeholder={`예)
## 점검 안내
- 11/10(월) 02:00~03:00
- 서비스 일시 중지

자세한 내용은 [공지 링크](https://example.com) 참고`}
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nPinned} onChange={(e) => setNPinned(e.target.checked)} />
              상단 고정(📌)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nPublished} onChange={(e) => setNPublished(e.target.checked)} />
              게시(published)
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={saveNotice}
              disabled={nSaving}
              className={`rounded px-4 py-2 text-sm font-semibold ${
                nSaving ? 'bg-slate-300 text-slate-600' : 'bg-black text-white hover:opacity-90'
              }`}
            >
              {noticeId ? '수정 저장' : '등록'}
            </button>

            {noticeId && (
              <button
                onClick={deleteNotice}
                type="button"
                className="rounded px-4 py-2 text-sm font-semibold border border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                삭제
              </button>
            )}
          </div>
        </div>

        {/* 목록 */}
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
                  <tr
                    key={n.id}
                    className="border-t hover:bg-slate-50/60 dark:hover:bg-slate-900/30 cursor-pointer"
                    onClick={() => loadNoticeToForm(n)}
                    title="클릭하여 폼에 불러오기"
                  >
                    <td className="py-2 px-3">{n.pinned ? '📌' : ''}</td>
                    <td className="py-2 px-3 truncate">{n.title}</td>
                    <td className="py-2 px-3">{n.published === false ? '숨김' : '게시'}</td>
                    <td className="py-2 px-3 text-xs">{fmtDate(n.createdAt)}</td>
                    <td className="py-2 px-3 text-xs">{fmtDate(n.updatedAt)}</td>
                  </tr>
                ))}
                {noticeRows.length === 0 && !nLoading && (
                  <tr>
                    <td className="py-4 px-3 text-center text-xs text-slate-500" colSpan={5}>
                      등록된 공지가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ───────────── [섹션 2] 메뉴 관리: 비활성 + 유료화(라디오) + 구독버튼 ───────────── */}
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

        {/* A. 비활성화(OFF) — 기존 그대로 */}
        <h3 className="text-sm font-semibold mt-2 mb-2">비활성화(OFF)</h3>
        <p className="text-xs text-slate-600 mb-3">
          체크된 메뉴는 사이드바에서 <b>보여지되 클릭이 차단</b>됩니다. (<code>settings/uploadPolicy.navigation.disabled</code>)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {ALL_MENUS.map((m) => {
            const checked = new Set(navDisabled).has(m.slug);
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

        {/* B. 유료화(단일 선택: 무료/Basic/Premium) — ✅ 변경된 부분 */}
        <h3 className="text-sm font-semibold mt-2 mb-2">유료화(구독 필요)</h3>
        <p className="text-xs text-slate-600 mb-3">
          메뉴별로 <b>무료/Basic/Premium</b> 중 하나를 선택합니다.
          저장 시 <code>navigation.tiers</code>로 기록되며, 하위 호환을 위해 <code>navigation.paid</code>도 자동 생성됩니다.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {ALL_MENUS.map((m) => {
            const curr = navTiers[m.slug] ?? 'free';
            const set = (tier: Tier) => setNavTiers(prev => ({ ...prev, [m.slug]: tier }));

            return (
              <div
                key={m.slug}
                className="rounded-lg border border-amber-200 dark:border-amber-800 p-3"
              >
                <div className="text-sm font-medium mb-2 flex items-center gap-2">
                  <span>{m.label}</span>
                  {(curr !== 'free') && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
                      {curr === 'premium' ? 'Premium' : 'Basic'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`tier-${m.slug}`}
                      checked={curr === 'free'}
                      onChange={() => set('free')}
                    />
                    무료
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`tier-${m.slug}`}
                      checked={curr === 'basic'}
                      onChange={() => set('basic')}
                    />
                    Basic
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`tier-${m.slug}`}
                      checked={curr === 'premium'}
                      onChange={() => set('premium')}
                    />
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

      {/* ───────────── [섹션 3] 사용자 관리 (기존 유지) ───────────── */}
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
              navigation: {
                disabled: navDisabled,
                // paid는 tiers에서 파생되므로 여기선 표시만 유지
                paid: Object.entries(navTiers).filter(([,t]) => t !== 'free').map(([slug]) => slug),
                tiers: navTiers,
              },
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
