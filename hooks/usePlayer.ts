import { set } from "react-hook-form"
import { create } from "zustand"

interface PlayerStore {
  ids: string[]
  activeId?: string
  setId: (id: string) => void
  setIds: (ikd: string[]) => void
  reset: () => void
}

const usePlayer = create<PlayerStore>(set => ({
  ids: [],
  activeId: undefined,
  setId: (id: string) => set({ activeId: id }),
  setIds: (ids: string[]) => set({ ids: ids }),
  reset: () => set({ ids: [], activeId: undefined }),
}))

export default usePlayer
