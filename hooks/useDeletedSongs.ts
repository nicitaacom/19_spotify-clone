import { create } from "zustand"
import usePlayer from "@/hooks/usePlayer"

// Keep deleted IDs hidden while server-rendered props or in-flight searches are still stale.
const useDeletedSongs = create<{
  ids: ReadonlySet<string>
  markDeleted: (id: string) => void
}>(set => ({
  ids: new Set<string>(),
  markDeleted: id => {
    const songId = String(id)
    set(state => ({ ids: new Set([...Array.from(state.ids), songId]) }))
    usePlayer.getState().removeSong(songId)
  },
}))

export default useDeletedSongs
