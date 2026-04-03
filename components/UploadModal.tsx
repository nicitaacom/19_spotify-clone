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

const UploadModal = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState("")
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([])

  const uploadModal = useUploadModal()
  const { supabaseClient } = useSessionContext()
  const { user, subscription } = useUser()
  const router = useRouter()
  const turnstileRef = useRef<HTMLDivElement>(null)
  const { isVerified, token, resetTurnstileFn, shouldRenderChallenge } = useVerifyHuman(turnstileRef, {
    isEnabled: uploadModal.isOpen,
  })
  const isHumanGateEnabled = Boolean(process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY)
  const isCreateBlocked = isLoading || (isHumanGateEnabled && !isVerified)

  const { register, handleSubmit, reset } = useForm<FieldValues>({
    defaultValues: {
      author: "",
      title: "",
      song: null,
      image: null,
      playlistId: "",
    },
  })

  useEffect(() => {
    if (!uploadModal.isOpen || !user) {
      setPlaylists([])
      return
    }

    const fetchPlaylists = async () => {
      const { data, error } = await supabaseClient
        .from("playlists")
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

  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond === 0) return "0 B/s"
    const k = 1024
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"]
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k))
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const uploadFileWithProgress = (
    path: string,
    file: File,
    bucket: string,
  ): Promise<{ path: string; error: any }> => {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, error } = await supabaseClient.storage.from(bucket).createSignedUploadUrl(path)

        if (error) {
          return resolve({ path: "", error })
        }

        const xhr = new XMLHttpRequest()
        const startTime = Date.now()

        xhr.upload.addEventListener("progress", event => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100
            const elapsedTime = (Date.now() - startTime) / 1000
            const speed = elapsedTime > 0 ? event.loaded / elapsedTime : 0

            setUploadProgress(progress)
            setUploadSpeed(formatSpeed(speed))
          }
        })

        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({ path, error: null })
            } else {
              resolve({ path: "", error: new Error(xhr.statusText || "Upload failed") })
            }
          }
        }

        xhr.open("PUT", data.signedUrl)
        xhr.send(file)
      } catch (err) {
        resolve({ path: "", error: err })
      }
    })
  }

  const onSubmit: SubmitHandler<FieldValues> = async values => {
    try {
      setIsLoading(true)
      setUploadProgress(0)
      setUploadSpeed("")

      const imageFile = values.image?.[0]
      const songFile = values.song?.[0]

      if (!imageFile || !songFile || !user) {
        toast.error("Missing fields")
        return
      }

      // Duration Check
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

      if (isHumanGateEnabled && !isDev) {
        if (!isVerified || !token) {
          toast.error("Complete the Cloudflare challenge before creating a song.")
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

      // Upload Song with real progress
      const { error: songError } = await uploadFileWithProgress(songPath, songFile, "songs")

      if (songError) {
        setIsLoading(false)
        return toast.error("Failed song upload")
      }

      // Upload Image (we can skip progress for smaller images or keep it)
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
        .from("songs")
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

      // Add to playlist if selected
      if (values.playlistId) {
        const { data: existingPositions } = await supabaseClient
          .from("playlist_songs")
          .select("position")
          .eq("playlist_id", values.playlistId)
          .order("position", { ascending: false })
          .limit(1)

        const nextPosition = (existingPositions?.[0]?.position ?? -1) + 1

        await supabaseClient.from("playlist_songs").insert({
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
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-y-4">
        {shouldRenderChallenge && <TurnstileChallenge isVerified={isVerified} turnstileRef={turnstileRef} />}
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

        <Button disabled={isCreateBlocked} type="submit">
          {isLoading ? "Uploading..." : "Create"}
        </Button>
      </form>
    </Modal>
  )
}

export default UploadModal
