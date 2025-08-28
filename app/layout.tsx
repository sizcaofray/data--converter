// 📄 app/layout.tsx

import './globals.css';
import { ReactNode } from 'react';
import LayoutEffectWrapper from '@/components/LayoutEffectWrapper';
import BootpayScript from '@/components/BootpayScript';
import { UserProvider } from '@/contexts/UserContext';

export const metadata = {
  title: 'Data Handler',
  description: 'Data Convert & Validation service',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <BootpayScript />
        <LayoutEffectWrapper />
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
