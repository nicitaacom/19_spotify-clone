// IDs for every "are you sure?" confirmation modal in the app. Add a new key here (and its data
// shape below) when a new confirmation is needed — the store, provider, and initial state are all
// keyed off this union.
export type TAreYouSureModals =
  | "areYouSureDeletePlaylist"
  | "areYouSureDeleteSong"
  | "areYouSureLogout"

// Per-modal data payload. Each key mirrors a TAreYouSureModals id; use `undefined` for modals that
// need no data. The title/message shown in the modal are built from this in the provider.
export interface ModalData {
  areYouSureDeletePlaylist?: { title: string }
  areYouSureDeleteSong?: { title: string }
  areYouSureLogout?: undefined
}

export const initialModalData: ModalData = {
  areYouSureDeletePlaylist: undefined,
  areYouSureDeleteSong: undefined,
  areYouSureLogout: undefined,
}
