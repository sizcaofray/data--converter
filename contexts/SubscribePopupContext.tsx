// 📄 contexts/SubscribePopupContext.tsx
'use client';

import { createContext, useContext, useState } from 'react';

type ContextType = {
  show: boolean;
  open: () => void;
  close: () => void;
};

const SubscribePopupContext = createContext<ContextType>({
  show: false,
  open: () => {},
  close: () => {},
});

export const SubscribePopupProvider = ({ children }: { children: React.ReactNode }) => {
  const [show, setShow] = useState(false);

  const open = () => setShow(true);
  const close = () => setShow(false);

  return (
    <SubscribePopupContext.Provider value={{ show, open, close }}>
      {children}
    </SubscribePopupContext.Provider>
  );
};

export const useSubscribePopup = () => useContext(SubscribePopupContext);
