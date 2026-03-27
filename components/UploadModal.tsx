"use client"

import uniqid from "uniqid"
import React, { useRef, useState } from "react"
import { useSupabaseClient } from "@supabase/auth-helpers-react"
import { FieldValues, SubmitHandler, useForm } from "react-hook-form"
import { toast } from "react-hot-toast"
import { useRouter } from "next/navigation"

import useUploadModal from "@/hooks/useUploadModal"
import { useUser } from "@/hooks/useUser"
import { getSafeStoragePath } from "@/libs/helpers"
import { useVerifyHuman } from "@/hooks/useVerifyHuman"
import { verifyTurnstileTokenFn } from "@/app/utils/verifyTurnstileToken"

import Modal from "./Modal"
import Input from "./Input"
import Button from "./Button"
import TurnstileChallenge from "./TurnstileChallenge"

const UploadModal = () => {
  const [isLoading, setIsLoading] = useState(false)

  const uploadModal = useUploadModal()
  const supabaseClient = useSupabaseClient()
  const { user } = useUser()
  const router = useRouter()
  const turnstileRef = useRef<HTMLDivElement>(null)
  const { isVerified, token, resetTurnstileFn } = useVerifyHuman(turnstileRef, { isEnabled: uploadModal.isOpen })
  const isHumanGateEnabled = Boolean(process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY)
  const isCreateBlocked = isLoading || (isHumanGateEnabled && !isVerified)

  const { register, handleSubmit, reset } = useForm<FieldValues>({
    defaultValues: {
      author: "",
      title: "",
      song: null,
      image: null,
    },
  })

  const onChange = (open: boolean) => {
    if (!open) {
      reset()
      resetTurnstileFn()
      uploadModal.onClose()
    }
  }

  const onSubmit: SubmitHandler<FieldValues> = async values => {
    try {
      setIsLoading(true)

      const imageFile = values.image?.[0]
      const songFile = values.song?.[0]

      if (!imageFile || !songFile || !user) {
        toast.error("Missing fields")
        return
      }

      if (isHumanGateEnabled) {
        if (!isVerified || !token) {
          toast.error("Complete the Cloudflare challenge before creating a song.")
          return
        }

        const verifyTurnstileResp = await verifyTurnstileTokenFn(token)
        if (typeof verifyTurnstileResp === "string") {
          resetTurnstileFn()
          toast.error(verifyTurnstileResp)
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

      const { data: songData, error: songError } = await supabaseClient.storage.from("songs").upload(songPath, songFile, {
        cacheControl: "3600",
        upsert: false,
      })

      if (songError) {
        setIsLoading(false)
        return toast.error("Failed song upload")
      }

      const { data: imageData, error: imageError } = await supabaseClient.storage
        .from("images")
        .upload(imagePath, imageFile, {
          cacheControl: "3600",
          upsert: false,
        })

      if (imageError) {
        setIsLoading(false)
        return toast.error("Failed image upload")
      }

      const { error: supabaseError } = await supabaseClient.from("songs").insert({
        user_id: user.id,
        title: values.title,
        author: values.author,
        image_path: imageData.path,
        song_path: songData.path,
      })

      if (supabaseError) {
        return toast.error(supabaseError.message)
      }

      router.refresh()
      setIsLoading(false)
      toast.success("Song created!")
      reset()
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
        <TurnstileChallenge isVerified={isVerified} turnstileRef={turnstileRef} />
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
        <Button disabled={isCreateBlocked} type="submit">
          Create
        </Button>
      </form>
    </Modal>
  )
}

export default UploadModal
