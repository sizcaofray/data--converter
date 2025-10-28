'use client';

/**
 * components/admin/NavigationToggle.tsx
 * -----------------------------------------------------------
 * 목적:
 *  - 기존 "메뉴 비활성화(navigation.disabled)" 기능 유지
 *  - 전역 "구독 버튼 활성화(subscribeButtonEnabled)" 토글 추가
 *
 * 데이터:
 *  - 경로: settings/uploadPolicy
 *  - 필드:
 *      navigation.disabled: string[]         // 기존 유지
 *      subscribeButtonEnabled: boolean       // 신규 추가 (기본 true)
 *
 * 주의:
 *  - setDoc(..., { merge: true }) → 기존 값 보존
 *  - 변수명/키 이름 혼동 금지: subscribeButtonEnabled ← subscribeEnabled(state)
 */

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

type MenuConfig = { slug: string; label: string };

// ⚠️ 사이드바 슬러그와 동일하게 유지
const ALL_MENUS: MenuConfig[] = [
  { slug: 'convert', label: 'Data Convert' },
  { slug: 'compare', label: 'Compare' },
  { slug: 'random',  label: 'Random' },
  { slug: 'admin',   label: 'Admin' },
];

function sanitizeSlugArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const s = new Set<string>();
  for (const v of input) {
    const t = String(v ?? '').trim();
    if (t) s.add(t);
  }
  return [...s].sort();
}

export default function NavigationToggle() {
  // ── 기존: 메뉴 비활성화 목록
  const [disabled, setDisabled] = useState<string[]>([]);
  // ── 신규: 전역 구독 버튼 ON/OFF
  const [subscribeEnabled, setSubscribeEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  // Firestore 실시간 구독 (settings/uploadPolicy)
  useEffect(() => {
    const ref = doc(db, 'settings', 'uploadPolicy');
    return onSnapshot(ref, (snap) => {
      const data = (snap.data() as any) || {};
      setDisabled(sanitizeSlugArray(data?.navigation?.disabled));
      setSubscribeEnabled(
        data?.subscribeButtonEnabled === undefined
          ? true
          : Boolean(data.subscribeButtonEnabled)
      );
    });
  }, []);

  // 체크박스 토글(기존 유지)
  const toggleSlug = (slug: string) =>
    setDisabled((prev) => {
      const s = new Set(prev);
      s.has(slug) ? s.delete(slug) : s.add(slug);
      return [...s].sort();
    });

  const disabledSet = useMemo(() => new Set(disabled), [disabled]);

  // 저장: merge=true → 기존 필드 보존
  const save = async () => {
    setSaving(true);
    try {
      const ref = doc(db, 'settings', 'uploadPolicy');
      await setDoc(
        ref,
        {
          navigation: { disabled },
          subscribeButtonEnabled: subscribeEnabled, // ✅ 신규 필드
          updatedAt: new Date(),
        },
        { merge: true }
      );
      alert('메뉴/구독 설정이 저장되었습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-6">

      {/* ✅ 상단에 구독 버튼 활성화 토글 표시 */}
      <div className="flex items-center gap-3 mb-4">
        <span className="font-medium">구독 버튼 활성화</span>
        <button
          type="button"
          className={`px-3 py-1 rounded border ${
            subscribeEnabled ? 'bg-green-600 text-white' : 'bg-gray-200'
          }`}
          onClick={() => setSubscribeEnabled(v => !v)}
          aria-pressed={subscribeEnabled}
          aria-label="구독 버튼 활성화 토글"
        >
          {subscribeEnabled ? '활성화' : '비활성화'}
        </button>
      </div>

      <header className="space-y-1">
        <h2 className="text-lg font-bold">메뉴 관리</h2>
        <p className="text-sm text-slate-500">
          체크된 메뉴는 사이트바에서 보여지되 클릭이 차단됩니다.
          <span className="opacity-70"> (settings/uploadPolicy.navigation.disabled)</span>
        </p>
      </header>

      {/* ── 기존: 메뉴 비활성화 체크박스 목록 */}
      <div className="space-y-2">
        <div className="text-sm text-slate-600">아래 체크된 메뉴는 비활성화됩니다.</div>
        <div className="grid grid-cols-2 gap-2">
          {ALL_MENUS.map(({ slug, label }) => (
            <label key={slug} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={disabledSet.has(slug)}
                onChange={() => toggleSlug(slug)}
              />
              <span>
                {label}{' '}
                <span className="text-xs text-slate-500">({slug})</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 저장 */}
      <div className="flex items-center justify-between border-t pt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={`rounded px-4 py-2 text-sm font-semibold ${
            saving ? 'bg-slate-300 text-slate-600' : 'bg-black text-white hover:opacity-90'
          }`}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        <div className="text-xs text-slate-500">
          문서: <code>settings/uploadPolicy</code> · 필드:{' '}
          <code>navigation.disabled</code>, <code>subscribeButtonEnabled</code>
        </div>
      </div>
    </section>
  );
}
