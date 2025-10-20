'use client';

/**
 * settings/uploadPolicy 문서의 navigation.disabled(string[])을
 * 토글로 편집하는 "메뉴 관리" 섹션 컴포넌트.
 *
 * ✅ 기존 업로드 정책(uploadPolicy) 필드들은 setDoc(..., { merge: true })로 보존됩니다.
 * ✅ 역할/구독에 따른 사이드바 노출 로직에는 영향 없습니다(사이드바에서 disabled면 '보여주되 클릭 불가').
 */

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

type MenuConfig = { slug: string; label: string };

/**
 * 프로젝트에 존재하는 실제 메뉴 slug로 구성하세요.
 * (Sidebar의 href 첫 세그먼트와 동일해야 함)
 */
const ALL_MENUS: MenuConfig[] = [
  { slug: 'convert', label: 'Data Convert' },
  { slug: 'compare', label: 'Compare' },
  { slug: 'random',  label: 'Random' },
  { slug: 'admin',   label: 'Admin' },
];

export default function NavigationToggle() {
  const [disabled, setDisabled] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // settings/uploadPolicy.navigation.disabled 구독
  useEffect(() => {
    const ref = doc(db, 'settings', 'uploadPolicy');
    return onSnapshot(ref, (snap) => {
      const data = snap.data() as any | undefined;
      const arr = data?.navigation?.disabled;
      setDisabled(Array.isArray(arr) ? arr : []);
    });
  }, []);

  const disabledSet = useMemo(() => new Set(disabled), [disabled]);

  const toggle = (slug: string) => {
    setDisabled(prev => {
      const s = new Set(prev);
      s.has(slug) ? s.delete(slug) : s.add(slug);
      return Array.from(s);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const ref = doc(db, 'settings', 'uploadPolicy');
      await setDoc(ref, { navigation: { disabled } }, { merge: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <h2 className="text-lg font-bold mb-2">메뉴 관리 (비활성화)</h2>
      <p className="text-sm text-slate-600 mb-4">
        체크된 메뉴는 사이드바에서 <b>보여지되 클릭이 차단</b>됩니다.
        (<code>settings/uploadPolicy.navigation.disabled</code>에 저장)
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
                onChange={() => toggle(m.slug)}
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
          onClick={save}
          disabled={saving}
          className={`rounded px-4 py-2 text-sm font-semibold ${
            saving ? 'bg-slate-300 text-slate-600' : 'bg-black text-white hover:opacity-90'
          }`}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        <div className="text-xs text-slate-500 self-center">
          문서: <code>settings/uploadPolicy</code> / 필드: <code>navigation.disabled: string[]</code> (merge 저장)
        </div>
      </div>
    </section>
  );
}
