"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

export const EXCLUSIVE_PLAYBACK_STORAGE_KEY = "exclusive-playback-preference"

interface ExclusivePlaybackPreferenceStore {
  enabledByUserId: Record<string, boolean>
  hasHydrated: boolean
  setEnabled: (userId: string, enabled: boolean) => void
  setHasHydrated: (hasHydrated: boolean) => void
}

const useExclusivePlaybackPreference = create<ExclusivePlaybackPreferenceStore>()(
  persist(
    set => ({
      enabledByUserId: {},
      hasHydrated: false,
      setEnabled: (userId, enabled) =>
        set(state => ({
          enabledByUserId: {
            ...state.enabledByUserId,
            [userId]: enabled,
          },
        })),
      setHasHydrated: hasHydrated => set({ hasHydrated }),
    }),
    {
      name: EXCLUSIVE_PLAYBACK_STORAGE_KEY,
      partialize: state => ({ enabledByUserId: state.enabledByUserId }),
      onRehydrateStorage: () => state => state?.setHasHydrated(true),
    },
  ),
)

export default useExclusivePlaybackPreference
