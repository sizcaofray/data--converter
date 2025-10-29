'use client';

/**
 * components/admin/NavigationToggle.tsx
 * -----------------------------------------------------------
 * 목적:
 *  - 기존 "메뉴 비활성화(navigation.disabled)" 기능 유지
 *  - 전역 "구독 버튼 활성화(subscribeButtonEnabled)" 토글 유지
 *  - ✅ 새 메뉴: 'PDF Tool'(pdf-tool), 'Pattern Editor'(pattern-editor) 관리 포함
 *
 * 데이터 (Firestore):
 *  - 문서 경로: settings/uploadPolicy
 *  - 필드:
 *      navigation.disabled: string[]         // 체크된 메뉴는 "비활성화"로 저장 (기존 유지)
 *      subscribeButtonEnabled: boolean       // 전역 구독 버튼 ON/OFF (기본 true)
 *
 * 주의:
 *  - setDoc(..., { merge: true }) 사용으로 기존 값 보존
 *  - 사이드바 메뉴의 slug와 동일하게 유지해야 동작 일치
 */

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase'; // ← 프로젝트 경로 유지

/** 개별 메뉴 정의 타입 */
type MenuConfig = { slug: string; label: string; order?: number; adminOnly?: boolean };

/** 
 * ✅ 사이드바와 slug를 반드시 일치시켜 주세요.
 *    순서는 'Data Convert' → 'Compare' → 'PDF Tool' → 'Pattern Editor' → 'Random' → 'Admin'
 */
const ALL_MENUS: MenuConfig[] = [
  { slug: 'convert',        label: 'Data Convert',   order: 10 },
  { slug: 'compare',        label: 'Compare',        order: 20 },

  // ⬇️ 신규 추가 (요청사항)
  { slug: 'pdf-tool',       label: 'PDF Tool',       order: 30 },
  { slug: 'pattern-editor', label: 'Pattern Editor', order: 40 },

  { slug: 'random',         label: 'Random',         order: 50 },
  { slug: 'admin',          label: 'Admin',          order: 90, adminOnly: true },
];

/** 배열 sanitize 유틸 (중복/공백 제거, 문자열화) */
function sanitizeSlugArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const s = new Set<string>();
  for (const v of input) {
    const t = String(v ?? '').trim();
    if (t) s.add(t);
  }
  return [...s].sort();
}

/** 컴포넌트 */
export default function NavigationToggle() {
  // ── 기존: 비활성화(slug) 목록 상태
  const [disabled, setDisabled] = useState<string[]>([]);
  // ── 기존: 전역 "구독 버튼 활성화" 상태
  const [subscribeEnabled, setSubscribeEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Firestore 문서 ref
  const policyRef = doc(db, 'settings', 'uploadPolicy');

  // ── 초기/실시간 로드
  useEffect(() => {
    const unSub = onSnapshot(policyRef, (snap) => {
      const data = (snap.data() as any) || {};
      // disabled 목록 sanitize + 현재 관리 대상 slug로 필터링
      const known = new Set(ALL_MENUS.map(m => m.slug));
      const rawDisabled = sanitizeSlugArray(data?.navigation?.disabled);
      const filtered = rawDisabled.filter(s => known.has(s));
      setDisabled(filtered);

      // 전역 구독 버튼 기본값: true
      setSubscribeEnabled(
        data?.subscribeButtonEnabled === undefined
          ? true
          : Boolean(data.subscribeButtonEnabled)
      );

      setLoading(false);
    });

    return () => unSub();
  }, [policyRef]);

  // 체크 토글 핸들러 (체크=비활성화)
  const onToggle = (slug: string) => {
    setDisabled((prev) => {
      const set = new Set(prev);
      set.has(slug) ? set.delete(slug) : set.add(slug);
      return [...set].sort();
    });
  };

  const disabledSet = useMemo(() => new Set(disabled), [disabled]);

  // 저장
  const onSave = async () => {
    setSaving(true);
    try {
      await setDoc(
        policyRef,
        {
          navigation: { disabled },
          subscribeButtonEnabled: subscribeEnabled,
          updatedAt: new Date(),
        },
        { merge: true }
      );
      alert('메뉴/구독 설정이 저장되었습니다.');
    } catch (err) {
      console.error(err);
      alert('저장 중 오류가 발생했습니다. 콘솔을 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  // 사이드 설명
  const HelpNote = () => (
    <p className="text-xs text-slate-500">
      체크된 항목은 <code>settings/uploadPolicy.navigation.disabled</code>에 저장되며,
      사이드바에서 <b>보이되 클릭이 비활성화</b>됩니다.
    </p>
  );

  // 정렬된 메뉴 목록
  const menus = useMemo(
    () => [...ALL_MENUS].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    []
  );

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-6">
      {/* 전역 구독 버튼 토글 */}
      <div className="flex items-center gap-3 mb-2">
        <span className="font-medium">구독 버튼 활성화</span>
        <button
          type="button"
          className={`px-3 py-1 rounded border ${
            subscribeEnabled ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-white/80'
          }`}
          onClick={() => setSubscribeEnabled(v => !v)}
          aria-pressed={subscribeEnabled}
          aria-label="구독 버튼 활성화 토글"
        >
          {subscribeEnabled ? '활성화' : '비활성화'}
        </button>
      </div>

      {/* 헤더 */}
      <header className="space-y-1">
        <h2 className="text-lg font-bold">메뉴 관리</h2>
        <HelpNote />
      </header>

      {/* 체크박스 목록 */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-sm text-slate-500">불러오는 중…</div>
        ) : (
          <>
            <div className="text-sm text-slate-600 dark:text-slate-300">아래 체크된 메뉴는 비활성화됩니다.</div>
            <div className="grid grid-cols-2 gap-2">
              {menus.map(({ slug, label, adminOnly }) => (
                <label key={slug} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={disabledSet.has(slug)}
                    onChange={() => onToggle(slug)}
                  />
                  <span>
                    {label}{' '}
                    <span className="text-xs text-slate-500">({slug})</span>
                  </span>
                  {adminOnly && (
                    <span className="text-[10px] rounded px-1.5 py-0.5 border border-gray-300 dark:border-gray-700">
                      admin only
                    </span>
                  )}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 저장 */}
      <div className="flex items-center justify-between border-t pt-4">
        <button
          type="button"
          onClick={onSave}
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
