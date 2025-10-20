// components/admin/NavigationToggle.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

type MenuConfig = { slug: string; label: string };

// 프로젝트 사이드바의 실제 메뉴 slug/href에 맞춰 필요시 수정
const ALL_MENUS: MenuConfig[] = [
  { slug: 'convert', label: 'Data Convert' },
  { slug: 'compare', label: 'Data Compare' },
  { slug: 'random',  label: 'Random' },
  { slug: 'admin',   label: 'Admin' },
];

export default function NavigationToggle() {
  const [disabled, setDisabled] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

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
    setDisabled((prev) => {
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
      <h2 className="text-lg font-bold mb-2">사이드바 메뉴 비활성화</h2>
      <p className="text-sm text-slate-600 mb-4">
        체크된 메뉴는 좌측 사이드바에서 흐림 처리되며 클릭이 차단됩니다.
        (<code>settings/uploadPolicy.navigation.disabled</code> 저장)
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
          문서: <code>settings/uploadPolicy</code> / 필드: <code>navigation.disabled</code>
        </div>
      </div>
    </section>
  );
}
