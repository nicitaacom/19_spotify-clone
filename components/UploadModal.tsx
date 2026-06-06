"use client"

import uniqid from "uniqid"
import React, { useRef, useState, useEffect } from "react"
import { useSupabaseClient, useSessionContext } from "@supabase/auth-helpers-react"
import { FieldValues, SubmitHandler, useForm } from "react-hook-form"
import { toast } from "react-hot-toast"
import { useRouter } from "next/navigation"

import useUploadModal from "@/hooks/useUploadModal"
import { useUser } from "@/hooks/useUser"
import { getSafeStoragePath } from "@/libs/helpers"
import { useVerifyHuman } from "@/hooks/useVerifyHuman"
import { verifyTurnstileTokenFn } from "@/app/utils/verifyTurnstileToken"
import { PlaylistOption } from "@/types"

import Modal from "./Modal"
import Input from "./Input"
import Button from "./Button"
import TurnstileChallenge from "./TurnstileChallenge"
import ProgressBar from "./ProgressBar"

// Show Turnstile challenge on ~10% of uploads
const TURNSTILE_PROBABILITY = 0.1

const UploadModal = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState("")
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([])
  // Determined once per modal open: whether this upload requires human verification
  const [requiresChallenge, setRequiresChallenge] = useState(false)

  useEffect(() => {
    if (!isLoading) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isLoading])

  const uploadModal = useUploadModal()
  const { supabaseClient } = useSessionContext()
  const { user, subscription } = useUser()
  const router = useRouter()
  const turnstileRef = useRef<HTMLDivElement>(null)
  const isHumanGateEnabled = Boolean(process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY)
  const { isVerified, token, resetTurnstileFn } = useVerifyHuman(turnstileRef, {
    isEnabled: uploadModal.isOpen && requiresChallenge,
  })
  const isCreateBlocked = isLoading || (requiresChallenge && isHumanGateEnabled && !isVerified)

  const { register, handleSubmit, reset } = useForm<FieldValues>({
    defaultValues: {
      author: "",
      title: "",
      song: null,
      image: null,
      playlistId: "",
    },
  })

  // When modal opens, decide once whether this session requires the challenge
  useEffect(() => {
    if (uploadModal.isOpen) {
      setRequiresChallenge(Math.random() < TURNSTILE_PROBABILITY)
    } else {
      setRequiresChallenge(false)
    }
  }, [uploadModal.isOpen])

  useEffect(() => {
    if (!uploadModal.isOpen || !user) {
      setPlaylists([])
      return
    }

    const fetchPlaylists = async () => {
      const { data, error } = await supabaseClient
        .from("19_playlists")
        .select("id, title, updated_at, visibility")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })

      if (error) {
        toast.error(error.message)
      } else {
        setPlaylists(
          (data ?? []).map(playlist => ({
            id: String(playlist.id),
            title: playlist.title,
            updated_at: playlist.updated_at,
            visibility: playlist.visibility,
          })),
        )
      }
    }

    fetchPlaylists()
  }, [uploadModal.isOpen, supabaseClient, user])

  const onChange = (open: boolean) => {
    if (!open) {
      reset()
      setUploadProgress(0)
      setUploadSpeed("")
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

const uploadFileWithProgress = async (
    path: string,
    file: File,
    bucket: string,
  ): Promise<{ path: string; error: any }> => {
    setUploadProgress(0)
    setUploadSpeed("")

    const { error } = await supabaseClient.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "audio/mpeg",
    })

    if (error) {
      console.error(`[upload] ${bucket}/${path} →`, error.message)
      return { path: "", error }
    }

    setUploadProgress(100)
    return { path, error: null }
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
        toast.error(`Song file must be ${MAX_SONG_SIZE_MiB} MiB or smaller.`)
        setIsLoading(false)
        return
      }

      try {
        const duration = await getSongDuration(songFile)
        const hours = duration / 3600
        const isPro = subscription?.status === "active"
        const limit = isPro ? 12 : 3

        if (hours > limit) {
          toast.error(`Song is too long. ${isPro ? "Pro" : "Free"} limit is ${limit} hours.`)
          setIsLoading(false)
          return
        }
      } catch (e) {
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

        const verifyTurnstileResp = await verifyTurnstileTokenFn(token)
        if (typeof verifyTurnstileResp === "string") {
          resetTurnstileFn()
          toast.error(verifyTurnstileResp)
          setIsLoading(false)
          return
        }
      }

      const uniqueID = uniqid()
      const songPath = getSafeStoragePath({
        prefix: "song",
        value: values.title,
        uniqueId: uniqueID,
        fileName: songFile.name,
      })
      const imagePath = getSafeStoragePath({
        prefix: "image",
        value: values.title,
        uniqueId: uniqueID,
        fileName: imageFile.name,
      })

      const { error: songError } = await uploadFileWithProgress(songPath, songFile, "songs")

      if (songError) {
        setIsLoading(false)
        return toast.error(`Failed song upload: ${songError.message ?? songError}`)
      }

      const { error: imageError } = await supabaseClient.storage.from("images").upload(imagePath, imageFile, {
        cacheControl: "3600",
        upsert: false,
      })

      if (imageError) {
        setIsLoading(false)
        return toast.error("Failed image upload")
      }

      setUploadProgress(100)

      const { data: songRecord, error: supabaseError } = await supabaseClient
        .from("19_songs")
        .insert({
          user_id: user.id,
          title: values.title,
          author: values.author,
          image_path: imagePath,
          song_path: songPath,
        })
        .select("id")
        .single()

      if (supabaseError) {
        return toast.error(supabaseError.message)
      }

      if (values.playlistId) {
        const { data: existingPositions } = await supabaseClient
          .from("19_playlist_songs")
          .select("position")
          .eq("playlist_id", values.playlistId)
          .order("position", { ascending: false })
          .limit(1)

        const nextPosition = (existingPositions?.[0]?.position ?? -1) + 1

        await supabaseClient.from("19_playlist_songs").insert({
          playlist_id: values.playlistId,
          song_id: songRecord.id,
          position: nextPosition,
        })
      }

      router.refresh()

      setIsLoading(false)
      toast.success("Song created!")
      reset()
      setUploadProgress(0)
      setUploadSpeed("")
      resetTurnstileFn()
      uploadModal.onClose()
    } catch (error) {
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

        <div>
          <div className="pb-1 text-sm text-neutral-400">Add to Playlist (Optional)</div>
          <select
            id="playlistId"
            disabled={isLoading}
            {...register("playlistId")}
            className="flex w-full rounded-md bg-neutral-700 border border-transparent px-3 py-3 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 text-white cursor-pointer hover:bg-neutral-600 transition">
            <option value="">No playlist</option>
            {playlists.map(playlist => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.title}
              </option>
            ))}
          </select>
        </div>

        {isLoading && <ProgressBar progress={uploadProgress} speed={uploadSpeed} />}

        {requiresChallenge && isHumanGateEnabled && (
          <TurnstileChallenge isVerified={isVerified} turnstileRef={turnstileRef} />
        )}

        <Button disabled={isCreateBlocked} type="submit">
          {isLoading ? "Uploading..." : "Create"}
        </Button>
      </form>
    </Modal>
  )
}

export default UploadModal
