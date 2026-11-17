import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
}

/** Local UI chrome state. Only per-device conveniences live here (never user data). */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
    }),
    {
      name: 'lifeos-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
