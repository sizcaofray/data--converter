'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type PlanKey = 'free' | 'basic' | 'premium';
interface Plan { key: PlanKey; name: string; price: number; description: string; }

/** 구독 버튼이 있는 페이지에서만 팝업이 동작하도록 설계 */
export default function SubscribePopup() {
  const [open, setOpen] = useState(false);
  const hasTriggersRef = useRef(false);

  const plans = useMemo<Plan[]>(
    () => [
      { key: 'free',    name: '무료',    price: 0,       description: '기본 변환 (한 번에 1개)' },
      { key: 'basic',   name: 'Basic',   price: 10_000,  description: '동시 처리 확장 / 일반 사용자용' },
      { key: 'premium', name: 'Premium', price: 100_000, description: '검증/리포트 포함 / 파워 유저용' },
    ],
    []
  );

  /** 현재 페이지에 트리거 버튼이 있는지 1회 점검 */
  useEffect(() => {
    const sel = '[data-open="subscribe"], #subscribe-btn, .subscribe-btn';
    const exist = !!document.querySelector(sel);
    hasTriggersRef.current = exist;
  }, []);

  /** 트리거가 있을 때만 클릭 위임 리스너 등록 */
  useEffect(() => {
    if (!hasTriggersRef.current) return; // ← 다른 페이지는 여기서 바로 종료 (리스너 미등록)

    const matchTrigger = (el: Element | null): Element | null => {
      let cur: Element | null = el;
      while (cur) {
        if (
          (cur as HTMLElement).matches?.('[data-open="subscribe"]') ||
          (cur as HTMLElement).matches?.('#subscribe-btn') ||
          (cur as HTMLElement).matches?.('.subscribe-btn')
        ) return cur;
        cur = cur.parentElement;
      }
      return null;
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const t = matchTrigger(target);
      if (!t) return;
      if ((t as HTMLElement).tagName === 'A') e.preventDefault(); // 라우팅 방지
      setOpen(true);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  /** ESC로 닫기 */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  /** 오버레이 바깥 클릭 시 닫기 */
  const onOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setOpen(false);
  }, []);

  /** (후속 단계) 실제 결제는 여기에서 Bootpay.request 연결 예정 */
  const onSelectPlan = useCallback((p: Plan) => {
    alert(`'${p.name}' 플랜 선택됨. 결제 연동은 다음 단계에서 연결합니다.`);
    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
      onClick={onOverlayClick}
      aria-modal="true"
      role="dialog"
    >
      <div className="w-full max-w-[680px] rounded-2xl bg-white text-black dark:bg-zinc-900 dark:text-white shadow-xl border border-black/5 dark:border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div className="text-lg font-semibold">구독 플랜 선택</div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="닫기"
            className="rounded-md px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div key={p.key} className="rounded-xl border border-black/10 dark:border-white/10 p-4 flex flex-col">
              <div className="font-medium text-base mb-1">{p.name}</div>
              <div className="text-sm opacity-80 mb-3">{p.description}</div>
              <div className="text-sm font-semibold mb-4">{p.price.toLocaleString()}원</div>
              <button
                type="button"
                onClick={() => onSelectPlan(p)}
                className="mt-auto w-full rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10"
              >
                선택
              </button>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-black/10 dark:border-white/10 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-2 border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
