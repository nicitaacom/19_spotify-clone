import { create } from "zustand"
import { devtools, subscribeWithSelector } from "zustand/middleware"

interface OwnerStore {
  isOwner: boolean
  setIsOwner: (isOwner: boolean) => void
}

type SetState = (fn: (prevState: OwnerStore) => OwnerStore) => void

const ownerStore = (set: SetState): OwnerStore => ({
  isOwner: false,
  setIsOwner: isOwner => set(state => ({ ...state, isOwner })),
})

const useOwnerStore = create(subscribeWithSelector(devtools(ownerStore)))

export default useOwnerStore
