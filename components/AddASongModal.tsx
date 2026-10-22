"use client"

import React, { useRef, useState, useEffect, useCallback } from "react"
import { FieldValues, SubmitHandler, useForm, useWatch } from "react-hook-form"
import { toast } from "react-hot-toast"
import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import { FiEdit2, FiPlus, FiCheck, FiX, FiCornerDownLeft } from "react-icons/fi"

import useUploadModal from "@/hooks/useUploadModal"
import useCreatePlaylistModal from "@/hooks/useCreatePlaylistModal"
import { useAutoFocus } from "@/hooks/useAutoFocus"
import { useHotkey } from "@/hooks/useHotkey"
import { useUser } from "@/hooks/useUser"
import { useVerifyHuman } from "@/hooks/useVerifyHuman"
import { verifyTurnstileTokenFn } from "@/app/utils/verifyTurnstileToken"
import { PlaylistOption } from "@/types"
import supabaseClient from "@/libs/supabaseClient"
import { getPlaylistSlug, getPlaylistSlugPreservingCase } from "@/libs/helpers"

import Modal from "./Modal"
import Input from "./Input"
import Button from "./Button"
import TurnstileChallenge from "./turnstile/TurnstileChallenge"
import { SongTagsInput } from "./SongTagsInput"
import { inferPlaylistGenreTags, songTagsWithDraft } from "@/libs/songTags"
import { usePlaylistRecentTags } from "@/hooks/usePlaylistRecentTags"

// Show Turnstile challenge on ~10% of uploads
const TURNSTILE_PROBABILITY = 0.1
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
const CREATE_SONG_HOTKEY_MODIFIERS: Array<"ctrl"> = ["ctrl"]
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
}

const isSupportedCoverImage = (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  return IMAGE_MIME_BY_EXTENSION[extension] === file.type.toLowerCase()
}

const AddASongModal = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [isPreparingAudio, setIsPreparingAudio] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState("")
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([])
  const [playlistSearch, setPlaylistSearch] = useState("")
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistOption | null>(null)
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null)
  const [playlistSlugDraft, setPlaylistSlugDraft] = useState("")
  const [playlistSlugError, setPlaylistSlugError] = useState("")
  const [isSavingPlaylistSlug, setIsSavingPlaylistSlug] = useState(false)
  const [requiresChallenge, setRequiresChallenge] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [embeddedImage, setEmbeddedImage] = useState<File | null>(null)
  const [readingMetadata, setReadingMetadata] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const playlistSlugInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const metadataRequest = useRef(0)
  const formRef = useRef<HTMLFormElement>(null)

  useAutoFocus(playlistSlugInputRef, editingPlaylistId !== null, 50)

  useEffect(() => {
    if (!isLoading) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isLoading])

  const uploadModal = useUploadModal()
  const createPlaylistModal = useCreatePlaylistModal()

  const { user, subscription } = useUser()
  const router = useRouter()
  const pathname = usePathname()
  const playlistSlug = pathname?.match(/^\/playlists\/([^/]+)\/?$/)?.[1]
  const turnstileRef = useRef<HTMLDivElement>(null)
  const isHumanGateEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const { isVerified, token, resetTurnstileFn } = useVerifyHuman(turnstileRef, {
    isEnabled: uploadModal.isOpen && requiresChallenge,
  })
  const isCreateBlocked = isLoading || (requiresChallenge && isHumanGateEnabled && !isVerified)

  const { register, handleSubmit, reset, resetField, control, getValues } = useForm<FieldValues>({
    defaultValues: { author: "", title: "", song: null, image: null, isPaid: false },
  })
  const playlistQuery = playlistSearch.trim().toLocaleLowerCase()
  const filteredPlaylists = playlists.filter(playlist => playlist.title.toLocaleLowerCase().includes(playlistQuery))
  const isCreateDisabled = isCreateBlocked || readingMetadata || !selectedPlaylist

  useHotkey({
    hotkey: "Enter",
    modifiers: CREATE_SONG_HOTKEY_MODIFIERS,
    isEnabled: uploadModal.isOpen && editingPlaylistId === null && !isCreateDisabled && !confirmDiscard,
    onKeyPressFn: () => {
      formRef.current?.requestSubmit()
    },
  })

  const selectedPlaylistId = selectedPlaylist?.id ?? ""
  const [uploadCount, setUploadCount] = useState(0)
  const [lastUploadedPlaylistSlug, setLastUploadedPlaylistSlug] = useState<string | null>(null)
  const playlistRecentTags = usePlaylistRecentTags(selectedPlaylistId, uploadModal.isOpen && Boolean(user), uploadCount)
  const [tagsCustomized, setTagsCustomized] = useState(false)
  const [tagsPlaylistId, setTagsPlaylistId] = useState(selectedPlaylistId)
  const [appliedSuggestionKey, setAppliedSuggestionKey] = useState("")
  if (selectedPlaylistId !== tagsPlaylistId) {
    setTagsPlaylistId(selectedPlaylistId)
    setAppliedSuggestionKey("")
    if (!selectedPlaylistId) setTagsCustomized(false)
    if (!selectedPlaylistId || !tagsCustomized) setTags([])
  }
  const genreTags = selectedPlaylist ? inferPlaylistGenreTags(selectedPlaylist.title, selectedPlaylist.slug) : []
  const playlistReady = playlistRecentTags.ready && playlistRecentTags.playlistId === selectedPlaylistId
  const playlistSuggestionTags = playlistReady ? Array.from(new Set([...playlistRecentTags.top, ...genreTags])) : []
  const tagsToApply = !playlistReady ? [] : playlistRecentTags.autofill.length ? playlistRecentTags.autofill : genreTags
  const suggestionKey = playlistReady ? `${selectedPlaylistId}:${tagsToApply.join("\0")}` : ""
  const applyingSuggestion = !tagsCustomized && Boolean(suggestionKey) && suggestionKey !== appliedSuggestionKey
  if (applyingSuggestion) {
    setAppliedSuggestionKey(suggestionKey)
    setTags(tagsToApply)
  }
  const visibleTags = applyingSuggestion ? tagsToApply : tags
  const tagsMatchApplied = tagsToApply.length > 0 && visibleTags.length === tagsToApply.length && tagsToApply.every(tag => visibleTags.includes(tag))
  const playlistNote = !tagsMatchApplied || !selectedPlaylist
    ? ""
    : playlistRecentTags.autofill.length
      ? `Filled from your most used tags on ${selectedPlaylist.title}.`
      : `Filled from the ${selectedPlaylist.title} playlist name.`
  const playlistLabel = !playlistReady || !selectedPlaylist || playlistSuggestionTags.length === 0
    ? ""
    : playlistRecentTags.top.length
      ? `Most used on ${selectedPlaylist.title}`
      : `From ${selectedPlaylist.title}`

  const songInput = register("song", { required: true })
  const imageInput = register("image")
  const selectedImage = (useWatch({ control, name: "image" }) as FileList | null)?.[0]
  const previewTitle = (useWatch({ control, name: "title" }) as string) || "Song title"
  const previewAuthor = (useWatch({ control, name: "author" }) as string) || "Song author"
  const coverImage = selectedImage ?? embeddedImage
  const [coverPreview, setCoverPreview] = useState<{ file: File; url: string } | null>(null)
  const coverPreviewUrl = coverImage && coverPreview?.file === coverImage ? coverPreview.url : null

  const setCoverPreviewFile = (file?: File | null) => {
    const preview = file ? { file, url: URL.createObjectURL(file) } : null
    setCoverPreview(preview)
  }

  useEffect(() => {
    if (!coverPreview) return
    return () => URL.revokeObjectURL(coverPreview.url)
  }, [coverPreview])

  const onPaste = (event: React.ClipboardEvent<HTMLFormElement>) => {
    const input = imageInputRef.current
    if (isLoading || !input) return

    const pastedImages = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"))
    if (!pastedImages.length) return

    event.preventDefault()
    const image = pastedImages.find(isSupportedCoverImage)
    if (!image) {
      setUploadError("Choose a JPG, JPEG, PNG, WebP, or AVIF image.")
      return
    }
    const transfer = new DataTransfer()
    transfer.items.add(image)
    input.files = transfer.files
    imageInput.onChange({ target: input, type: "change" })
    setCoverPreviewFile(image)
    setUploadError("")
  }

  const [prevModalIsOpen, setPrevModalIsOpen] = useState(uploadModal.isOpen)
  if (uploadModal.isOpen !== prevModalIsOpen) {
    setPrevModalIsOpen(uploadModal.isOpen)
    if (!uploadModal.isOpen) {
      setRequiresChallenge(false)
      setConfirmDiscard(false)
    }
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
  }, [uploadModal.isOpen, uploadCount])

  const fetchPlaylists = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabaseClient
      .from("19_playlists")
      .select("id, slug, title, updated_at, visibility")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })

    if (error) {
      setUploadError(error.message)
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
      setSelectedPlaylist(prev => prev
        ? (mapped.find(p => p.id === prev.id) ?? null)
        : (mapped.find(p => p.slug === decodeURIComponent(playlistSlug ?? "")) ?? null))
    }
  }, [user, playlistSlug])

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

  const discardAndClose = () => {
    reset()
    setTags([])
    setUploadProgress(0)
    setUploadSpeed("")
    setSelectedPlaylist(null)
    setPlaylistSearch("")
    setEditingPlaylistId(null)
    setPlaylistSlugDraft("")
    setPlaylistSlugError("")
    setUploadError("")
    setEmbeddedImage(null)
    setCoverPreviewFile(null)
    setReadingMetadata(false)
    setConfirmDiscard(false)
    metadataRequest.current++
    setLastUploadedPlaylistSlug(null)
    setUploadCount(0)
    resetTurnstileFn()
    uploadModal.onClose()
  }

  const hasUnsavedSongChanges = () => {
    const values = getValues()
    const title = typeof values.title === "string" ? values.title.trim() : ""
    const author = typeof values.author === "string" ? values.author.trim() : ""
    const draftTag = formRef.current?.querySelector<HTMLInputElement>("[data-song-tags-input]")?.value.trim() ?? ""
    const routePlaylistSlug = playlistSlug ? decodeURIComponent(playlistSlug) : ""
    const baselinePlaylistSlug = lastUploadedPlaylistSlug ?? routePlaylistSlug
    const playlistChanged = selectedPlaylist !== null && selectedPlaylist.slug !== baselinePlaylistSlug
    return Boolean(
      title
      || author
      || values.song?.[0]
      || values.image?.[0]
      || embeddedImage
      || values.isPaid
      || tagsCustomized
      || draftTag
      || playlistChanged
    )
  }

  const onChange = (open: boolean) => {
    if (open || isLoading || editingPlaylistId !== null || confirmDiscard) return
    if (hasUnsavedSongChanges()) {
      setConfirmDiscard(true)
      return
    }
    discardAndClose()
  }

  const handleEscapeKeyDown = (event: { preventDefault: () => void }) => {
    if (!confirmDiscard) return
    event.preventDefault()
    setConfirmDiscard(false)
  }

  const savePlaylistSlug = async (event: React.SyntheticEvent, playlist: PlaylistOption) => {
    event.preventDefault()
    event.stopPropagation()
    if (!user) {
      setPlaylistSlugError("Sign in to edit this playlist URL.")
      toast.error("Sign in to edit this playlist URL.")
      return
    }

    const trimmedSlug = playlistSlugDraft.trim()
    if (!trimmedSlug) {
      setPlaylistSlugError("Enter a playlist URL slug.")
      toast.error("Enter a playlist URL slug.")
      return
    }

    const slug = getPlaylistSlugPreservingCase(trimmedSlug)
    if (slug === playlist.slug) {
      setEditingPlaylistId(null)
      setPlaylistSlugDraft("")
      setPlaylistSlugError("")
      return
    }
    setIsSavingPlaylistSlug(true)
    setPlaylistSlugError("")
    try {
      const { data, error } = await supabaseClient
        .from("19_playlists")
        .update({ slug, updated_at: new Date().toISOString() })
        .eq("id", playlist.id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle()

      if (error) {
        if (error.code === "23505") throw new Error("That playlist URL is already in use.")
        throw error
      }
      if (!data) throw new Error("Unable to update this playlist URL.")

      setPlaylists(current => current.map(item => item.id === playlist.id ? { ...item, slug } : item))
      setSelectedPlaylist(current => current?.id === playlist.id ? { ...current, slug } : current)
      setEditingPlaylistId(null)
      setPlaylistSlugDraft("")
      if (playlistSlug === playlist.slug) router.replace(`/playlists/${slug}`)
      router.refresh()
      toast.success("Playlist URL updated.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update this playlist URL."
      setPlaylistSlugError(message)
      toast.error(message)
    } finally {
      setIsSavingPlaylistSlug(false)
    }
  }

  const togglePlaylistSlugEditor = (event: React.MouseEvent<HTMLButtonElement>, playlist: PlaylistOption) => {
    event.preventDefault()
    event.stopPropagation()
    if (editingPlaylistId === playlist.id) {
      setEditingPlaylistId(null)
      setPlaylistSlugDraft("")
      setPlaylistSlugError("")
      return
    }
    setEditingPlaylistId(playlist.id)
    setPlaylistSlugDraft(
      getPlaylistSlug(playlist.title) === playlist.slug
        ? getPlaylistSlugPreservingCase(playlist.title)
        : playlist.slug,
    )
    setPlaylistSlugError("")
  }

  const handlePlaylistSlugKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, playlist: PlaylistOption) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      setEditingPlaylistId(null)
      setPlaylistSlugDraft("")
      setPlaylistSlugError("")
      return
    }
    if (event.key !== "Enter") return
    event.preventDefault()
    event.stopPropagation()
    void savePlaylistSlug(event, playlist)
  }

  const cancelPlaylistSlugEdit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setEditingPlaylistId(null)
    setPlaylistSlugDraft("")
    setPlaylistSlugError("")
  }

  const readSongMetadata = async (file?: File) => {
    const request = ++metadataRequest.current
    setEmbeddedImage(null)
    resetField("image")
    setCoverPreviewFile(null)
    setUploadError("")
    if (!file) {
      setReadingMetadata(false)
      return
    }
    setReadingMetadata(true)
    try {
      const { parseBlob } = await import("music-metadata")
      const metadata = await parseBlob(file)
      const picture = metadata.common.picture?.[0]
      if (request !== metadataRequest.current || !picture?.data.length) return
      const mime = picture.format.toLowerCase()
      const extension = Object.keys(IMAGE_MIME_BY_EXTENSION).find(
        supportedExtension => IMAGE_MIME_BY_EXTENSION[supportedExtension] === mime,
      )
      if (!extension) return
      const embeddedCover = new File([picture.data], `embedded-cover.${extension}`, { type: mime })
      setEmbeddedImage(embeddedCover)
      if (!imageInputRef.current?.files?.[0]) setCoverPreviewFile(embeddedCover)
    } catch {
      // An unreadable tag simply leaves the image picker available.
    } finally {
      if (request === metadataRequest.current) setReadingMetadata(false)
    }
  }

  const handleSongChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const extension = file?.name.split(".").pop()?.toLowerCase() ?? ""
    const acceptedAudio = ["mp3", "m4a", "wav", "flac", "ogg", "oga", "opus", "aac", "webm", "aif", "aiff"]
    if (file && !file.type.startsWith("audio/") && !acceptedAudio.includes(extension)) {
      event.target.value = ""
      songInput.onChange(event)
      void readSongMetadata(undefined)
      setUploadError(`"${file.name}" is not an audio file. Pick an audio file (MP3, WAV, M4A, FLAC, OGG…).`)
      return
    }
    songInput.onChange(event)
    readSongMetadata(file)
    setUploadError("")
  }

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && !isSupportedCoverImage(file)) {
      event.target.value = ""
      imageInput.onChange(event)
      setCoverPreviewFile(embeddedImage)
      setUploadError("Choose a JPG, JPEG, PNG, WebP, or AVIF image.")
      return
    }
    imageInput.onChange(event)
    setCoverPreviewFile(file ?? embeddedImage)
    setUploadError("")
  }

  const getSongDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio()
      audio.src = URL.createObjectURL(file)
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src)
        resolve(audio.duration)
      }
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src)
        reject(new Error("Could not read audio metadata"))
      }
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

  const onSubmit: SubmitHandler<FieldValues> = async (values, event) => {
    try {
      const form = event?.target instanceof HTMLFormElement ? event.target : null
      const submittedTags = songTagsWithDraft(visibleTags, form?.querySelector<HTMLInputElement>("[data-song-tags-input]")?.value ?? "")
      setIsLoading(true)
      setUploadError("")
      setUploadProgress(0)
      setUploadSpeed("")

      const imageFile = values.image?.[0] ?? embeddedImage
      let songFile = values.song?.[0]

      if (!user) {
        setUploadError("You must be logged in to upload.")
        setIsLoading(false)
        return
      }
      if (!songFile) {
        setUploadError("Please select an audio file.")
        setIsLoading(false)
        return
      }
      if (readingMetadata) {
        setUploadError("Please wait for cover art to be checked.")
        setIsLoading(false)
        return
      }
      if (!imageFile) {
        setUploadError("Please select a cover image.")
        setIsLoading(false)
        return
      }
      if (!isSupportedCoverImage(imageFile)) {
        setUploadError("Choose a JPG, JPEG, PNG, WebP, or AVIF image.")
        setIsLoading(false)
        return
      }
      if (!selectedPlaylist) {
        setUploadError("Select a playlist before uploading.")
        setIsLoading(false)
        return
      }

      let duration: number
      try {
        duration = await getSongDuration(songFile)
        const isPro = subscription?.status === "active"
        const limit = isPro ? 12 : 3
        if (duration / 3600 > limit) {
          setUploadError(`Song is too long. ${isPro ? "Pro" : "Free"} limit is ${limit} hours.`)
          setIsLoading(false)
          return
        }
      } catch {
        setUploadError("Could not determine song duration. Choose a valid audio file.")
        setIsLoading(false)
        return
      }

      const isDev = process.env.NODE_ENV !== "production"
      if (requiresChallenge && isHumanGateEnabled && !isDev) {
        if (!isVerified || !token) {
          setUploadError("Complete the verification challenge before uploading.")
          setIsLoading(false)
          return
        }
        const verifyResp = await verifyTurnstileTokenFn(token)
        if (typeof verifyResp === "string") {
          resetTurnstileFn()
          setUploadError(verifyResp)
          setIsLoading(false)
          return
        }
      }

      setIsPreparingAudio(true)
      const { prepareSongUpload } = await import("@/libs/songUpload")
      songFile = await prepareSongUpload(songFile, duration, setUploadProgress)
      setIsPreparingAudio(false)

      const formData = new FormData()
      formData.append("song", songFile)
      formData.append("image", imageFile)
      formData.append("title", values.title)
      formData.append("author", values.author)
      formData.append("isPaid", values.isPaid ? "true" : "false")
      formData.append("tags", JSON.stringify(submittedTags))
      if (selectedPlaylist) {
        formData.append("playlistId", selectedPlaylist.id)
        formData.append("playlistSlug", selectedPlaylist.slug)
      }

      await uploadViaApi(formData)

      router.refresh()
      setIsLoading(false)
      toast.success("Song created!")
      reset()
      setTags([])
      setTagsCustomized(false)
      setAppliedSuggestionKey("")
      setUploadProgress(0)
      setUploadSpeed("")
      setEmbeddedImage(null)
      setCoverPreviewFile(null)
      setReadingMetadata(false)
      setUploadError("")
      setLastUploadedPlaylistSlug(selectedPlaylist?.slug ?? null)
      setUploadCount(count => count + 1)
      resetTurnstileFn()
      window.setTimeout(() => document.getElementById("title")?.focus(), 0)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Something went wrong. Please try again.")
    } finally {
      setIsPreparingAudio(false)
      setIsLoading(false)
    }
  }

  return (
    <Modal
      title="Add a song"
      description="Upload any audio file — it is stored as MP3"
      isOpen={uploadModal.isOpen}
      onChange={onChange}
      titleAside={(
        <div className="flex w-full min-w-0 items-center">
          {uploadError && (
            <p role="alert" title={uploadError} className="line-clamp-2 w-full min-w-0 overflow-hidden break-words rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs leading-4 text-red-200">
              {uploadError}
            </p>
          )}
        </div>
      )}
      contentClassName="h-auto w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] max-w-[960px] overflow-hidden p-3 sm:p-5 md:w-[94vw] md:max-h-[90dvh] md:max-w-[960px] md:p-7"
      titleClassName="mb-0 text-left text-2xl"
      descriptionClassName="mb-6 text-left text-neutral-300"
      isShowCloseButton={!confirmDiscard}
      onEscapeKeyDown={handleEscapeKeyDown}>
      <>
      <form
        ref={formRef}
        inert={confirmDiscard || undefined}
        onPaste={onPaste}
        onSubmit={handleSubmit(onSubmit, errors => {
          if (errors.title) setUploadError("Song title is required.")
          else if (errors.author) setUploadError("Song author is required.")
          else if (errors.song) setUploadError("Please select an audio file.")
          else if (errors.image) setUploadError("Please select a cover image.")
        })}
        className="grid min-h-0 max-h-[calc(100dvh-140px)] min-w-0 grid-cols-1 content-start gap-4 overflow-y-auto overscroll-contain md:max-h-none md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] md:gap-6 md:overflow-visible">
        <section className="flex min-w-0 flex-col gap-4">
          <div className="space-y-4">
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="title" className="mb-1 block text-sm text-neutral-300">Song title</label>
              <Input
                id="title"
                disabled={isLoading}
                {...register("title", { required: true, onChange: () => setUploadError("") })}
                placeholder="Interstellar"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="author" className="mb-1 block text-sm text-neutral-300">Song author</label>
              <Input
                id="author"
                disabled={isLoading}
                {...register("author", { required: true, onChange: () => setUploadError("") })}
                placeholder="Hans Zimmer"
              />
            </div>
          </div>

          <div className="min-w-0 space-y-1.5">
            <label htmlFor="song" className="block text-sm text-neutral-300">Select a song file</label>
            <Input
              className="min-w-0 max-w-full"
              disabled={isLoading}
              type="file"
              accept="audio/*"
              id="song"
              {...songInput}
              onChange={handleSongChange}
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <label htmlFor="image" className="block text-sm text-neutral-300">Select an image</label>
            <Input
              className="min-w-0 max-w-full"
              disabled={isLoading}
              type="file"
              accept={IMAGE_ACCEPT}
              id="image"
              {...imageInput}
              onChange={handleImageChange}
              ref={input => {
                imageInput.ref(input)
                imageInputRef.current = input
              }}
            />
            {embeddedImage && (
              <p className="break-words text-xs leading-5 text-neutral-400">
                Embedded cover art found. Choose or paste an image to replace it.
              </p>
            )}
          </div>
          </div>

          {playlistRecentTags.error && playlistReady && (
            <p role="alert" className="text-xs text-red-300">{playlistRecentTags.error}</p>
          )}
          <SongTagsInput
            key={uploadModal.isOpen ? `open-${uploadCount}` : "closed"}
            value={visibleTags}
            onChange={nextTags => { setTagsCustomized(true); setTags(nextTags) }}
            disabled={isLoading}
            playlistTags={playlistSuggestionTags}
            playlistLabel={playlistLabel}
            playlistNote={playlistNote}
            onUsePlaylistTags={tagsToApply.length > 0 && !tagsMatchApplied ? () => { setTagsCustomized(true); setTags(tagsToApply) } : undefined}
          />

          <section className="mt-auto min-w-0 rounded-lg border border-white/10 bg-elevated/50 p-4">
            <div className="mb-3 text-sm font-medium text-white">Song preview</div>
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-md bg-black text-2xl text-neutral-500">
                {coverPreviewUrl ? (
                  <Image src={coverPreviewUrl} alt="Song cover preview" width={96} height={96} unoptimized className="h-full w-full object-cover" />
                ) : (
                  <span aria-label="No cover selected">?</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="break-words text-base font-semibold text-white">{previewTitle}</p>
                <p className="mt-1 break-words text-sm text-neutral-400">{previewAuthor}</p>
              </div>
            </div>
            {requiresChallenge && isHumanGateEnabled && <TurnstileChallenge turnstileRef={turnstileRef} />}
          </section>
        </section>

        <aside className="min-w-0">
          <section className="flex min-h-0 min-w-0 flex-col rounded-lg border border-white/10 p-3 sm:p-4 md:h-full">
            <div className="pb-2 text-sm text-neutral-300">Add to Playlist</div>
            <div className="flex min-w-0 flex-col gap-1.5 md:min-h-0 md:flex-1">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => createPlaylistModal.onOpen({ skipRedirect: true })}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neon transition hover:bg-elevated disabled:opacity-50">
                <FiPlus size={14} />
                Create new playlist
              </button>

              <Input
                id="playlist-search"
                type="search"
                disabled={isLoading}
                value={playlistSearch}
                onChange={event => setPlaylistSearch(event.target.value)}
                placeholder="Search playlists..."
                aria-label="Search playlists"
                autoComplete="off"
                className="py-2"
              />

              <div role="group" aria-label="Your playlists" className="h-48 min-h-0 max-h-48 min-w-0 flex-none overflow-y-auto overscroll-contain rounded-md border border-white/10 bg-surface md:h-[min(42dvh,24rem)] md:min-h-0 md:max-h-[min(42dvh,24rem)] md:flex-none">
                {filteredPlaylists.map(playlist => (
                  <div key={playlist.id} className={`transition hover:bg-elevated ${selectedPlaylist?.id === playlist.id ? "bg-elevated" : ""}`}>
                    <div className="flex items-center">
                      {editingPlaylistId === playlist.id ? (
                        <>
                          <label htmlFor={`playlist-slug-${playlist.id}`} className="sr-only">
                            Playlist URL slug for {playlist.title}
                          </label>
                          <Input
                            id={`playlist-slug-${playlist.id}`}
                            ref={playlistSlugInputRef}
                            value={playlistSlugDraft}
                            onChange={event => {
                              setPlaylistSlugDraft(event.target.value)
                              setPlaylistSlugError("")
                            }}
                            onKeyDown={event => handlePlaylistSlugKeyDown(event, playlist)}
                            disabled={isSavingPlaylistSlug}
                            aria-invalid={Boolean(playlistSlugError)}
                            aria-describedby={playlistSlugError ? `playlist-slug-error-${playlist.id}` : undefined}
                            title={playlistSlugError || undefined}
                            className="min-w-0 flex-1 py-2"
                          />
                          {playlistSlugError && (
                            <span id={`playlist-slug-error-${playlist.id}`} className="sr-only">{playlistSlugError}</span>
                          )}
                          <button
                            type="button"
                            disabled={isSavingPlaylistSlug}
                            onClick={event => void savePlaylistSlug(event, playlist)}
                            className="rounded p-2 text-neon transition hover:bg-neon/10 disabled:opacity-50"
                            aria-label="Save playlist URL slug"
                            title="Save slug">
                            <FiCheck size={16} />
                          </button>
                          <button
                            type="button"
                            disabled={isSavingPlaylistSlug}
                            onClick={cancelPlaylistSlugEdit}
                            className="rounded p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                            aria-label="Cancel slug editing"
                            title="Cancel">
                            <FiX size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={isLoading || isSavingPlaylistSlug}
                            onClick={() => {
                              setSelectedPlaylist(playlist)
                              setUploadError("")
                            }}
                            aria-pressed={selectedPlaylist?.id === playlist.id}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white disabled:opacity-50">
                            <span className="min-w-0 break-words">{playlist.title}</span>
                            {selectedPlaylist?.id === playlist.id && (
                              <FiCheck size={14} className="ml-2 shrink-0 text-neon" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={isLoading || isSavingPlaylistSlug}
                            onClick={event => togglePlaylistSlugEditor(event, playlist)}
                            aria-label={`Edit ${playlist.title} URL slug`}
                            aria-expanded={false}
                            className="rounded px-3 py-2.5 text-yellow-400 transition hover:bg-yellow-400/10 hover:text-yellow-300 disabled:opacity-50"
                            title="Edit playlist URL slug">
                            <FiEdit2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {filteredPlaylists.length === 0 && (
                  <p className="px-3 py-2 text-sm text-neutral-500">
                    {playlists.length === 0 ? "No playlists yet." : "No playlists match that search."}
                  </p>
                )}
              </div>
            </div>

            <label className="mt-4 flex items-center gap-3 text-sm text-neutral-300">
              <input type="checkbox" disabled={isLoading} className="accent-green-400" {...register("isPaid", { onChange: () => setUploadError("") })} />
              Paid in selected playlist
            </label>
            {!selectedPlaylist && (
              <p className="mt-2 text-xs text-neutral-400">Select a playlist before uploading.</p>
            )}
          </section>
        </aside>

        <div className="sticky bottom-0 z-10 min-w-0 space-y-3 border-t border-white/10 bg-surface/95 pt-3 pb-1 backdrop-blur md:static md:col-span-2 md:bg-transparent md:pt-4 md:pb-0 md:backdrop-blur-none">
          <Button disabled={isCreateDisabled} type="submit" className="relative w-full overflow-hidden rounded-md">
            {isLoading && (
              <span style={{ width: `${uploadProgress}%` }} className="absolute inset-y-0 left-0 bg-black/15" aria-hidden="true" />
            )}
            {isLoading ? (
              <span className="relative">
                {isPreparingAudio
                  ? `Preparing audio… ${Math.round(uploadProgress)}%`
                  : `Uploading… ${Math.round(uploadProgress)}%${uploadSpeed ? ` · ${uploadSpeed}` : ""}`}
              </span>
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <span>Create</span>
                {!isCreateDisabled && editingPlaylistId === null && (
                  <span
                    aria-hidden="true"
                    title="Keyboard shortcut: Ctrl+Enter"
                    className="inline-flex items-center gap-1 rounded border border-black/20 bg-black/10 px-1.5 py-0.5 text-xs font-medium leading-none text-black/75">
                    <kbd>Ctrl</kbd>
                    <span>+</span>
                    <FiCornerDownLeft size={13} />
                  </span>
                )}
                <span className="sr-only">Keyboard shortcut: Ctrl+Enter</span>
              </span>
            )}
          </Button>
        </div>
      </form>
      {confirmDiscard && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-add-song-title"
            aria-describedby="discard-add-song-description"
            className="w-full max-w-sm rounded-lg border border-white/10 bg-surface p-5 shadow-2xl">
            <h2 id="discard-add-song-title" className="text-center text-xl font-bold text-white">
              Close and discard changes?
            </h2>
            <p id="discard-add-song-description" className="mb-5 mt-2 text-center text-sm text-neutral-300">
              The song details you entered will be lost.
            </p>
            <div className="flex gap-x-3">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmDiscard(false)}
                className="flex-1 rounded-md border border-white/10 bg-elevated px-4 py-2.5 text-sm font-semibold text-neutral-300 transition hover:bg-elevated/80">
                Keep editing
              </button>
              <button
                type="button"
                onClick={discardAndClose}
                className="flex-1 rounded-md bg-red-500/90 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-500">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    </Modal>
  )
}

export default AddASongModal
