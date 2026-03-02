import { createContext, useContext, useState, type ReactNode } from 'react';

interface SupportModalContextValue {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const SupportModalContext = createContext<SupportModalContextValue | null>(null);

export function SupportModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SupportModalContext.Provider
      value={{
        isOpen,
        openModal: () => setIsOpen(true),
        closeModal: () => setIsOpen(false),
      }}
    >
      {children}
    </SupportModalContext.Provider>
  );
}

export function useSupportModal() {
  const ctx = useContext(SupportModalContext);
  if (!ctx) throw new Error('useSupportModal must be used within SupportModalProvider');
  return ctx;
}
