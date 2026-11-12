import { create } from "zustand"
import { devtools, subscribeWithSelector } from "zustand/middleware"

// Its own store, apart from usePlayer: progress changes every 400ms, and inside usePlayer every component that reads
// the player (each song row, Sidebar, Header, PlayerContent) rendered again on each change. Only PlayerProgressBar
// reads it - everything else sets it with usePlayerProgress.getState().setProgress so it never subscribes.
interface PlayerProgressStore {
  progress: number
  setProgress: (progress: number) => void
}

type SetState = (fn: (prevState: PlayerProgressStore) => PlayerProgressStore) => void

const playerProgressStore = (set: SetState): PlayerProgressStore => ({
  progress: 0,
  setProgress: (progress: number) => set(state => ({ ...state, progress })),
})

const usePlayerProgress = create(subscribeWithSelector(devtools(playerProgressStore)))

export default usePlayerProgress
