"use client"

import React, { useRef, useState, useEffect, useCallback } from "react"
import { FieldValues, SubmitHandler, useForm } from "react-hook-form"
import { toast } from "react-hot-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FiEdit2, FiPlus, FiChevronDown, FiCheck } from "react-icons/fi"

import useUploadModal from "@/hooks/useUploadModal"
import useCreatePlaylistModal from "@/hooks/useCreatePlaylistModal"
import { useUser } from "@/hooks/useUser"
import { useVerifyHuman } from "@/hooks/useVerifyHuman"
import { verifyTurnstileTokenFn } from "@/app/utils/verifyTurnstileToken"
import { PlaylistOption } from "@/types"
import supabaseClient from "@/libs/supabaseClient"

import Modal from "./Modal"
import Input from "./Input"
import Button from "./Button"
import TurnstileChallenge from "./turnstile/TurnstileChallenge"
import ProgressBar from "./ProgressBar"

// Show Turnstile challenge on ~10% of uploads
const TURNSTILE_PROBABILITY = 0.1

const UploadModal = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState("")
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistOption | null>(null)
  const [requiresChallenge, setRequiresChallenge] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLoading) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isLoading])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const uploadModal = useUploadModal()
  const createPlaylistModal = useCreatePlaylistModal()

  const { user, subscription } = useUser()
  const router = useRouter()
  const turnstileRef = useRef<HTMLDivElement>(null)
  const isHumanGateEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const { isVerified, token, resetTurnstileFn } = useVerifyHuman(turnstileRef, {
    isEnabled: uploadModal.isOpen && requiresChallenge,
  })
  const isCreateBlocked = isLoading || (requiresChallenge && isHumanGateEnabled && !isVerified)

  const { register, handleSubmit, reset } = useForm<FieldValues>({
    defaultValues: { author: "", title: "", song: null, image: null },
  })

  const [prevModalIsOpen, setPrevModalIsOpen] = useState(uploadModal.isOpen)
  if (uploadModal.isOpen !== prevModalIsOpen) {
    setPrevModalIsOpen(uploadModal.isOpen)
    if (!uploadModal.isOpen) setRequiresChallenge(false)
  }

  useEffect(() => {
    if (!uploadModal.isOpen) return
    let isCancelled = false
    const rollChallenge = async () => {
      await Promise.resolve()
      if (!isCancelled) setRequiresChallenge(Math.random() < TURNSTILE_PROBABILITY)
    }
    rollChallenge()
    return () => {
      isCancelled = true
    }
  }, [uploadModal.isOpen])

  const fetchPlaylists = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabaseClient
      .from("19_playlists")
      .select("id, slug, title, updated_at, visibility")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })

    if (error) {
      toast.error(error.message)
    } else {
      const mapped: PlaylistOption[] = (data ?? []).map(p => ({
        id: String(p.id),
        slug: p.slug,
        title: p.title,
        updated_at: p.updated_at,
        visibility: p.visibility,
      }))
      setPlaylists(mapped)
      // If we had a selected playlist, keep it in sync (e.g. after rename)
      setSelectedPlaylist(prev => (prev ? (mapped.find(p => p.id === prev.id) ?? null) : null))
    }
  }, [user])

  const playlistsResetKey = `${uploadModal.isOpen}:${user?.id ?? ""}`
  const [prevPlaylistsResetKey, setPrevPlaylistsResetKey] = useState(playlistsResetKey)
  if (playlistsResetKey !== prevPlaylistsResetKey) {
    setPrevPlaylistsResetKey(playlistsResetKey)
    if (!uploadModal.isOpen || !user) {
      setPlaylists([])
      setSelectedPlaylist(null)
    }
  }

  useEffect(() => {
    if (!uploadModal.isOpen || !user) return
    const runFetchPlaylists = async () => {
      await fetchPlaylists()
    }
    runFetchPlaylists()
  }, [uploadModal.isOpen, user, fetchPlaylists])

  // Re-fetch playlists when create modal closes (user may have just created one)
  const createModalWasOpen = useRef(false)
  useEffect(() => {
    if (createPlaylistModal.isOpen) {
      createModalWasOpen.current = true
    } else if (createModalWasOpen.current) {
      createModalWasOpen.current = false
      fetchPlaylists()
    }
  }, [createPlaylistModal.isOpen, fetchPlaylists])

  const onChange = (open: boolean) => {
    if (!open) {
      reset()
      setUploadProgress(0)
      setUploadSpeed("")
      setSelectedPlaylist(null)
      resetTurnstileFn()
      uploadModal.onClose()
    }
  }

  const getSongDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio()
      audio.src = URL.createObjectURL(file)
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src)
        resolve(audio.duration)
      }
      audio.onerror = reject
    })
  }

  const uploadViaApi = (formData: FormData): Promise<{ id: number }> => {
    setUploadProgress(0)
    setUploadSpeed("")
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      let lastLoaded = 0
      let lastTime = Date.now()

      xhr.upload.onprogress = event => {
        if (!event.lengthComputable) return
        const now = Date.now()
        const elapsed = (now - lastTime) / 1000
        if (elapsed > 0.2) {
          const bytesPerSec = (event.loaded - lastLoaded) / elapsed
          setUploadSpeed(`${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`)
          lastLoaded = event.loaded
          lastTime = now
        }
        setUploadProgress(Math.round((event.loaded / event.total) * 100))
      }

      xhr.onload = () => {
        let body: { id?: number; error?: string } = {}
        try {
          body = JSON.parse(xhr.responseText)
        } catch {
          // ignore parse failure, handled by status check below
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body as { id: number })
        } else {
          reject(new Error(body?.error ?? `Upload failed (${xhr.status})`))
        }
      }
      xhr.onerror = () => reject(new Error("Upload failed"))
      xhr.open("POST", "/api/songs")
      xhr.send(formData)
    })
  }

  const onSubmit: SubmitHandler<FieldValues> = async values => {
    try {
      setIsLoading(true)
      setUploadProgress(0)
      setUploadSpeed("")

      const imageFile = values.image?.[0]
      const songFile = values.song?.[0]

      if (!user) {
        toast.error("You must be logged in to upload.")
        setIsLoading(false)
        return
      }
      if (!songFile) {
        toast.error("Please select an MP3 file.")
        setIsLoading(false)
        return
      }
      if (!imageFile) {
        toast.error("Please select a cover image.")
        setIsLoading(false)
        return
      }

      const MAX_SONG_SIZE_MiB = 50
      if (songFile.size > MAX_SONG_SIZE_MiB * 1024 * 1024) {
        toast.error(
          `File exceeds ${MAX_SONG_SIZE_MiB} MB. Please compress your MP3 first (Google "compress mp3 online").`,
          { duration: 6000 },
        )
        setIsLoading(false)
        return
      }

      try {
        const duration = await getSongDuration(songFile)
        const isPro = subscription?.status === "active"
        const limit = isPro ? 12 : 3
        if (duration / 3600 > limit) {
          toast.error(`Song is too long. ${isPro ? "Pro" : "Free"} limit is ${limit} hours.`)
          setIsLoading(false)
          return
        }
      } catch {
        toast.error("Could not determine song duration")
        setIsLoading(false)
        return
      }

      const isDev = process.env.NODE_ENV !== "production"
      if (requiresChallenge && isHumanGateEnabled && !isDev) {
        if (!isVerified || !token) {
          toast.error("Complete the verification challenge before uploading.")
          setIsLoading(false)
          return
        }
        const verifyResp = await verifyTurnstileTokenFn(token)
        if (typeof verifyResp === "string") {
          resetTurnstileFn()
          toast.error(verifyResp)
          setIsLoading(false)
          return
        }
      }

      const formData = new FormData()
      formData.append("song", songFile)
      formData.append("image", imageFile)
      formData.append("title", values.title)
      formData.append("author", values.author)
      if (selectedPlaylist) {
        formData.append("playlistId", selectedPlaylist.id)
        formData.append("playlistSlug", selectedPlaylist.slug)
      }

      try {
        await uploadViaApi(formData)
      } catch (err: unknown) {
        setIsLoading(false)
        return toast.error(err instanceof Error ? err.message : "Upload failed")
      }

      router.refresh()
      setIsLoading(false)
      toast.success("Song created!")
      reset()
      setUploadProgress(0)
      setUploadSpeed("")
      setSelectedPlaylist(null)
      resetTurnstileFn()
      uploadModal.onClose()
    } catch {
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal title="Add a song" description="Upload an mp3 file" isOpen={uploadModal.isOpen} onChange={onChange}>
      <form
        onSubmit={handleSubmit(onSubmit, errors => {
          if (errors.title) toast.error("Song title is required.")
          else if (errors.author) toast.error("Song author is required.")
          else if (errors.song) toast.error("Please select an MP3 file.")
          else if (errors.image) toast.error("Please select a cover image.")
        })}
        className="flex flex-col gap-y-4">
        <Input id="title" disabled={isLoading} {...register("title", { required: true })} placeholder="Song title" />
        <Input id="author" disabled={isLoading} {...register("author", { required: true })} placeholder="Song author" />
        <div>
          <div className="pb-1">Select a song file</div>
          <Input
            placeholder="test"
            disabled={isLoading}
            type="file"
            accept=".mp3"
            id="song"
            {...register("song", { required: true })}
          />
        </div>
        <div>
          <div className="pb-1">Select an image</div>
          <Input
            placeholder="test"
            disabled={isLoading}
            type="file"
            accept="image/*"
            id="image"
            {...register("image", { required: true })}
          />
        </div>

        {/* Playlist selector */}
        <div>
          <div className="pb-1 text-sm text-neutral-400">Add to Playlist (Optional)</div>
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setDropdownOpen(o => !o)}
              className="flex w-full items-center justify-between rounded-md bg-elevated px-3 py-3 text-sm text-white transition hover:bg-elevated/80 disabled:cursor-not-allowed disabled:opacity-50">
              <span className={selectedPlaylist ? "text-white" : "text-neutral-400"}>
                {selectedPlaylist ? selectedPlaylist.title : "No playlist"}
              </span>
              <FiChevronDown
                size={16}
                className={`text-neutral-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-white/10 bg-surface shadow-xl">
                {/* Create new */}
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false)
                    createPlaylistModal.onOpen({ skipRedirect: true })
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-neon transition hover:bg-elevated">
                  <FiPlus size={14} />
                  Create new playlist
                </button>

                {playlists.length > 0 && <div className="border-t border-white/10" />}

                {/* No playlist option */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlaylist(null)
                    setDropdownOpen(false)
                  }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-neutral-300 transition hover:bg-elevated">
                  No playlist
                  {!selectedPlaylist && <FiCheck size={14} className="text-neon" />}
                </button>

                {/* Playlist list */}
                {playlists.map(playlist => (
                  <div key={playlist.id} className="flex items-center hover:bg-elevated transition">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlaylist(playlist)
                        setDropdownOpen(false)
                      }}
                      className="flex flex-1 items-center justify-between px-3 py-2.5 text-sm text-white">
                      <span className="truncate">{playlist.title}</span>
                      {selectedPlaylist?.id === playlist.id && (
                        <FiCheck size={14} className="ml-2 shrink-0 text-neon" />
                      )}
                    </button>
                    <Link
                      href={`/playlists/${playlist.slug}`}
                      target="_blank"
                      onClick={() => setDropdownOpen(false)}
                      className="px-3 py-2.5 text-neutral-400 transition hover:text-white"
                      title="Edit playlist">
                      <FiEdit2 size={14} />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isLoading && <ProgressBar progress={uploadProgress} speed={uploadSpeed} />}

        {requiresChallenge && isHumanGateEnabled && (
          <TurnstileChallenge isVerified={isVerified} turnstileRef={turnstileRef} />
        )}

        <Button disabled={isCreateBlocked} type="submit" className="rounded-md">
          {isLoading ? "Uploading..." : "Create"}
        </Button>
      </form>
    </Modal>
  )
}

export default UploadModal
