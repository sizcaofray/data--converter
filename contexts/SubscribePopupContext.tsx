// contexts/SubscribePopupContext.tsx
'use client';

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export type PopupAPI = {
  show: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

// 기본값을 안전한 no-op으로 두면 Provider가 누락돼도 빌드/렌더가 멈추지 않습니다.
const defaultValue: PopupAPI = {
  show: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
};

const Ctx = createContext<PopupAPI>(defaultValue);

export function SubscribePopupProvider({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  const open = useCallback(() => setShow(true), []);
  const close = useCallback(() => setShow(false), []);
  const toggle = useCallback(() => setShow(s => !s), []);

  const value = useMemo<PopupAPI>(() => ({ show, open, close, toggle }), [show, open, close, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSubscribePopup(): PopupAPI {
  return useContext(Ctx);
}
