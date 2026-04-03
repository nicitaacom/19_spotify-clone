import { create } from "zustand"
import { devtools, persist, subscribeWithSelector } from "zustand/middleware"

interface VolumeStore {
  volume: number
  setVolume: (volume: number) => void
}

type SetState = (fn: (prevState: VolumeStore) => VolumeStore) => void

const volumeStore = (set: SetState): VolumeStore => ({
  volume: 1,
  setVolume: (volume: number) => set((state) => ({ ...state, volume })),
})

const useVolumeStore = create(
  subscribeWithSelector(
    devtools(
      persist(volumeStore, {
        name: "player-volume",
      })
    )
  )
)

export default useVolumeStore
