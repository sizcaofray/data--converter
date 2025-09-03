'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Ctx = {
  show: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const PopupCtx = createContext<Ctx | null>(null);

export function SubscribePopupProvider({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  // ✅ 핸들러 identity 고정
  const open = useCallback(() => setShow(true), []);
  const close = useCallback(() => setShow(false), []);
  const toggle = useCallback(() => setShow((s) => !s), []);

  // ✅ Provider value 메모이제이션 → 컨슈머 불필요 리렌더 방지
  const value = useMemo(() => ({ show, open, close, toggle }), [show, open, close, toggle]);

  return <PopupCtx.Provider value={value}>{children}</PopupCtx.Provider>;
}

export function useSubscribePopup() {
  const v = useContext(PopupCtx);
  if (!v) throw new Error('useSubscribePopup must be used within SubscribePopupProvider');
  return v;
}
