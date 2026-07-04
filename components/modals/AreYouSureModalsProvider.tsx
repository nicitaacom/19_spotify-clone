"use client"

import { useAreYouSureModals } from "@/store/modals/useAreYouSureModals"
import { useModalAnimation } from "@/hooks/useModalAnimation"
import { AreYouSureModal } from "./AreYouSureModal"

// Renders whichever "are you sure?" confirmation is active. Each modal is gated by useModalAnimation
// so it stays mounted through its exit animation. Copy for each id lives here; callers just
// openModal(id, data) and await the result.
export function AreYouSureModalsProvider() {
  const { isOpen, modalData } = useAreYouSureModals()

  const shouldRenderDeletePlaylist = useModalAnimation(isOpen.areYouSureDeletePlaylist)
  const shouldRenderDeleteSong = useModalAnimation(isOpen.areYouSureDeleteSong)
  const shouldRenderLogout = useModalAnimation(isOpen.areYouSureLogout)

  return (
    <>
      {shouldRenderDeletePlaylist && (
        <AreYouSureModal
          isOpen={isOpen.areYouSureDeletePlaylist}
          label="Delete playlist?"
          message={
            <>
              This permanently deletes{" "}
              <span className="font-semibold text-white">{modalData.areYouSureDeletePlaylist?.title}</span>. This cannot be
              undone.
            </>
          }
        />
      )}

      {shouldRenderDeleteSong && (
        <AreYouSureModal
          isOpen={isOpen.areYouSureDeleteSong}
          label="Delete song?"
          message={
            <>
              This permanently deletes{" "}
              <span className="font-semibold text-white">{modalData.areYouSureDeleteSong?.title}</span> and its files. This
              cannot be undone.
            </>
          }
        />
      )}

      {shouldRenderLogout && (
        <AreYouSureModal
          isOpen={isOpen.areYouSureLogout}
          label="Log out?"
          message="You'll need to sign in again to access your library."
          confirmLabel="Log out"
        />
      )}
    </>
  )
}
