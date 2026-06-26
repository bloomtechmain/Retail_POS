import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  receiptPaperWidth: number;
  setReceiptPaperWidth: (w: number) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      receiptPaperWidth: 80,
      setReceiptPaperWidth: (receiptPaperWidth) => set({ receiptPaperWidth }),
    }),
    { name: 'pos_settings' }
  )
);
