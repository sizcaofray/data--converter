'use client';

/**
 * 메뉴 관리 + 구독 버튼 활성화 토글
 * - 기존: settings/uploadPolicy.navigation.disabled (슬러그 비활성화 목록)
 * - 추가: settings/uploadPolicy.subscribeButtonEnabled (구독 버튼 전역 ON/OFF)
 *
 * 저장 시 setDoc(..., { merge: true })로 기존 필드 보존.
 */

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

type MenuConfig = { slug: string; label: string };

// 슬러그 후보(필요 시 확장)
const CANDIDATES: MenuConfig[] = [
  { slug: 'convert', label: 'Data Convert' },
  { slug: 'compare', label: 'Compare' },
  { slug: 'random',  label: 'Random' },
  { slug: 'admin',   label: 'Admin' },
  // { slug: 'subscribe', label: 'Subscribe' }, // 추후 사이드바에 항목 추가 시 활성
];

function sanitizeSlugArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map(v => String(v || '').trim()).filter(Boolean))].sort();
}

export default function NavigationToggle() {
  const [disabled, setDisabled] = useState<string[]>([]);
  const [subscribeEnabled, setSubscribeEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  // settings/uploadPolicy 실시간 구독
  useEffect(() => {
    const ref = doc(db, 'settings', 'uploadPolicy');
    return onSnapshot(ref, (snap) => {
      const data = (snap.data() as any) || {};
      const arr = data?.navigation?.disabled;
      setDisabled(sanitizeSlugArray(arr));
      setSubscribeEnabled(Boolean(
        data?.subscribeButtonEnabled === undefined ? true : data?.subscribeButtonEnabled
      ));
    });
  }, []);

  const toggleDisabled = (slug: string) => {
    setDisabled((prev) => {
      const set = new Set(prev);
      if (set.has(slug)) set.delete(slug);
      else set.add(slug);
      return [...set].sort();
    });
  };

  const disabledSet = useMemo(() => new Set(disabled), [disabled]);

  const save = async () => {
    setSaving(true);
    try {
      const ref = doc(db, 'settings', 'uploadPolicy');
      await setDoc(
        ref,
        {
          navigation: { disabled },
          subscribeButtonEnabled: subscribeEnabled, // ✅ 추가 저장
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
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
      <h2 className="text-lg font-bold">메뉴 관리</h2>

      {/* 1) 구독 버튼 전역 활성화 토글 */}
      <div className="flex items-center gap-3">
        <label className="font-medium">구독 버튼 활성화</label>
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

      {/* 2) 슬러그 비활성화 목록(기존 기능 유지) */}
      <div className="space-y-2">
        <div className="text-sm text-slate-600">아래 체크된 메뉴는 “보여주되 비활성화”됩니다.</div>
        <div className="grid grid-cols-2 gap-2">
          {CANDIDATES.map(({ slug, label }) => (
            <label key={slug} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={disabledSet.has(slug)}
                onChange={() => toggleDisabled(slug)}
              />
              <span>{label} <span className="text-xs text-slate-500">({slug})</span></span>
            </label>
          ))}
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </section>
  );
}
