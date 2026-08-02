import { create } from "zustand"
import { devtools, persist } from "zustand/middleware"

// Layer 1 of the visitor identity - the one layer the browser owns outright, and the only one that
// survives across days without a server round trip agreeing to it. It holds the transport form of the
// deviceId (see `app/utils/deviceId.ts`), never the signed id itself.
type DeviceIdStore = {
  storedDeviceId: string | null
  setStoredDeviceId: (storedDeviceId: string | null) => void
}

type SetState = (fn: (prevState: DeviceIdStore) => Partial<DeviceIdStore>) => void

const deviceIdStore = (set: SetState): DeviceIdStore => ({
  storedDeviceId: null,
  setStoredDeviceId: storedDeviceId => set(() => ({ storedDeviceId })),
})

export const useDeviceIdStore = create<DeviceIdStore>()(
  devtools(persist(set => deviceIdStore(set), { name: "deviceIdStore" })),
)
