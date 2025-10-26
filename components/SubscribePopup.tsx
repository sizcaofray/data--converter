// components/SubscribePopup.tsx
// 목적: Bootpay 연동 없이 "구독/업그레이드" 버튼 클릭 시 팝업 UI만 표시
// 사용법: 아무 버튼이나 다음 셀렉터를 만족하면 팝업이 뜸
//   - [data-open="subscribe"]  ← 권장
//   - #subscribe-btn
//   - .subscribe-btn
//
// 디자인 영향 최소화:
// - 평소에는 DOM 출력 없음
// - 열릴 때만 오버레이/모달을 그려서 기존 레이아웃에 영향 없음

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type PlanKey = 'free' | 'basic' | 'premium';

interface Plan {
  key: PlanKey;
  name: string;
  price: number;         // 원 단위 표기용(실결제 미사용)
  description: string;
}

export default function SubscribePopup() {
  // 팝업 open/close 상태
  const [open, setOpen] = useState(false);

  // 간단한 플랜 더미(표시용)
  const plans = useMemo<Plan[]>(
    () => [
      { key: 'free',    name: '무료',    price: 0,       description: '기본 변환 (한 번에 1개)' },
      { key: 'basic',   name: 'Basic',   price: 10_000,  description: '동시 처리 확장 / 일반 사용자용' },
      { key: 'premium', name: 'Premium', price: 100_000, description: '검증/리포트 포함 / 파워 유저용' },
    ],
    []
  );

  // 전역 클릭 위임: 지정된 셀렉터를 클릭하면 팝업 오픈
  useEffect(() => {
    const matchTrigger = (el: Element | null): Element | null => {
      let cur: Element | null = el;
      while (cur) {
        if (
          (cur as HTMLElement).matches?.('[data-open="subscribe"]') ||
          (cur as HTMLElement).matches?.('#subscribe-btn') ||
          (cur as HTMLElement).matches?.('.subscribe-btn')
        ) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const t = matchTrigger(target);
      if (!t) return;

      // a 태그라면 기본 이동 방지(원치 않는 라우팅 차단)
      const el = t as HTMLElement;
      if (el.tagName === 'A') e.preventDefault();

      setOpen(true);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // 오버레이 클릭 시 닫기
  const onOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setOpen(false);
  }, []);

  // (후속 단계) 결제 버튼 눌렀을 때 Bootpay.request 연결 예정
  const onSelectPlan = useCallback((p: Plan) => {
    // 현재 단계: 팝업만 띄움 → 선택 시 안내 후 닫기
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
        {/* 헤더 */}
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

        {/* 본문 */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div
              key={p.key}
              className="rounded-xl border border-black/10 dark:border-white/10 p-4 flex flex-col"
            >
              <div className="font-medium text-base mb-1">{p.name}</div>
              <div className="text-sm opacity-80 mb-3">{p.description}</div>
              <div className="text-sm font-semibold mb-4">
                {p.price.toLocaleString()}원
              </div>
              <button
                type="button"
                onClick={() => onSelectPlan(p)} // 현재는 안내만, 결제 연동은 후속
                className="mt-auto w-full rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10"
              >
                선택
              </button>
            </div>
          ))}
        </div>

        {/* 푸터 */}
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
