"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSupabaseClient } from "@supabase/auth-helpers-react"
import toast from "react-hot-toast"
import { MdMusicNote } from "react-icons/md"
import { FiTrash2, FiPlus, FiEdit2 } from "react-icons/fi"

import { Song } from "@/types"
import { useUser } from "@/hooks/useUser"
import useLoadImage from "@/hooks/useLoadImage"
import useAddToPlaylistModal from "@/hooks/useAddToPlaylistModal"
import useEditSongModal from "@/hooks/useEditSongModal"
import Button from "@/components/Button"
import CoverImage from "@/components/CoverImage"

interface MySongsContentProps {
  songs: Song[]
}

function SongRow({ song, onDelete, onUpdate }: { song: Song; onDelete: (id: string) => void; onUpdate: (updated: Song) => void }) {
  const imagePath = useLoadImage(song)
  const [deleting, setDeleting] = useState(false)
  const supabaseClient = useSupabaseClient()
  const addToPlaylistModal = useAddToPlaylistModal()
  const editSongModal = useEditSongModal()

  const handleDelete = async () => {
    if (!confirm(`Delete "${song.title}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const { error: dbError } = await supabaseClient.from("19_songs").delete().eq("id", song.id)

      if (dbError) {
        toast.error(dbError.message)
        setDeleting(false)
        return
      }

      await supabaseClient.storage.from("songs").remove([song.song_path])
      await supabaseClient.storage.from("images").remove([song.image_path])

      toast.success(`"${song.title}" deleted.`)
      onDelete(song.id)
    } catch {
      toast.error("Something went wrong.")
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-elevated/60 p-3 transition hover:border-neon/20 hover:bg-elevated">
      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg">
        <CoverImage
          src={imagePath}
          alt={song.title}
          fill
          sizes="56px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{song.title}</p>
        <p className="truncate text-xs text-neutral-400">By {song.author}</p>
      </div>
      <button
        onClick={() => addToPlaylistModal.onOpen(song)}
        aria-label={`Add ${song.title} to playlist`}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-neutral-400 transition hover:border-neon/40 hover:bg-neon/10 hover:text-neon"
      >
        <FiPlus size={15} />
      </button>
      <button
        onClick={() => editSongModal.onOpen(song, onUpdate)}
        aria-label={`Edit ${song.title}`}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-neutral-400 transition hover:border-yellow-500/40 hover:bg-yellow-500/10 hover:text-yellow-400"
      >
        <FiEdit2 size={15} />
      </button>
      <button
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete ${song.title}`}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FiTrash2 size={15} />
      </button>
    </div>
  )
}

const MySongsContent: React.FC<MySongsContentProps> = ({ songs: initialSongs }) => {
  const router = useRouter()
  const { isLoading, user } = useUser()
  const [songs, setSongs] = useState<Song[]>(initialSongs)

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/")
    }
  }, [isLoading, user, router])

  const handleDelete = (deletedId: string) => {
    setSongs(prev => prev.filter(s => s.id !== deletedId))
    router.refresh()
  }

  const handleUpdate = (updated: Song) => {
    setSongs(prev => prev.map(s => s.id === updated.id ? updated : s))
  }

  if (songs.length === 0) {
    return (
      <div className="px-6 pb-8">
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 px-6 py-12 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-neon">
            <MdMusicNote size={28} />
          </div>
          <h2 className="text-2xl font-semibold text-white">No uploaded songs</h2>
          <p className="mt-3 max-w-md text-sm text-neutral-400">
            Songs you upload will appear here. You can delete any of them from this page.
          </p>
          <Button className="mt-6 w-auto px-6 py-3" onClick={() => router.push("/")}>
            Go home
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-7 mt-4 flex flex-col gap-y-4 px-6 pb-8">
      <div className="rounded-[28px] border border-white/10 bg-gradient-to-r from-red-500/10 via-rose-500/5 to-transparent p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-200">Manage</p>
        <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Your uploaded songs</h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-300">
          Delete any song you uploaded. Removing it will also remove the audio and image files permanently.
        </p>
        <div className="mt-3 inline-block rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm font-medium text-white">
          {songs.length} {songs.length === 1 ? "song" : "songs"}
        </div>
      </div>

      <div className="flex flex-col gap-y-2">
        {songs.map(song => (
          <SongRow key={song.id} song={song} onDelete={handleDelete} onUpdate={handleUpdate} />
        ))}
      </div>
    </div>
  )
}

export default MySongsContent
