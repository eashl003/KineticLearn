import type { ReactNode } from 'react';
import { SupportModalProvider } from '../../contexts/SupportModalContext';
import { Header } from './Header';

export function MinimalShell({ children }: { children: ReactNode }) {
  return (
    <SupportModalProvider>
      <div className="shell">
        <Header />
        <main className="main">{children}</main>
      </div>
    </SupportModalProvider>
  );
}
