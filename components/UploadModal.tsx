'use client'

import { useRouter } from "next/navigation";
import { useState } from "react";

import uniqid from 'uniqid'
import toast from "react-hot-toast";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import { useSupabaseClient } from "@supabase/auth-helpers-react";

import useUploadModal from "@/hooks/useUploadModal";
import Modal from "./Modal";
import Input from "./Input";
import Button from "./Button";
import { useUser } from "@/hooks/useUser";

export default function UploadModal () {
  
  //Antonio use this method - I'd like to use formState:{isSubmitting}
  const [isLoading,setIsLoading] = useState(false)

  const uploadModal = useUploadModal()
  const supabaseClient = useSupabaseClient()
  const {user} = useUser()
  const router = useRouter()

  const {register,handleSubmit,reset} = useForm<FieldValues>({
    defaultValues:{
      author:'',
      title:'',
      song:null,
      image:null
    }
  })

  const onChange = (open:boolean) => {
    if (!open) {
      reset()
      uploadModal.onClose()
    }
  }

  const onSubmit:SubmitHandler<FieldValues> = async (values) => {
    try {
      setIsLoading(true)

      const imageFile = values.image?.[0]
      const songFile = values.song?.[0]

      if (!imageFile || !songFile || !user) {
toast.error('Missing fields')
return
      }

      const uniqueID = uniqid()

      //Upload img
      const {data:songData,error:songError} = await supabaseClient.storage.from('songs').upload(`song-${values.title}-${uniqueID}`,songFile,{
        cacheControl:'3600',
        upsert:false
      })
      if (songError) {
        setIsLoading(false)
        return toast.error('Failed song upload')
      }

      //Upload image
        const {data:imageData,error:imageError} = await supabaseClient.storage.from('images').upload(`image-${values.title}-${uniqueID}`,imageFile,{
        cacheControl:'3600',
        upsert:false
      })
      if (imageError) {
        setIsLoading(false)
        return toast.error('Failed image upload')
      }

      const {error:supabaseError} = await supabaseClient.from('songs').insert({user_id:user.id,
        title:values.title,
        author:values.author,
        image_path:imageData.path,
        song_path:songData.path
      })

      if (supabaseError) {
        setIsLoading(false)
        return toast.error(supabaseError.message)
      }

      router.refresh()
      setIsLoading(false)
      toast.success('Song created!')
      reset()
      uploadModal.onClose()
    } catch (error) {
      toast.error('Something went wrong')
    }
    finally {
      setIsLoading(false)
    }
  }

return (
    <Modal title="Add a song" description="Upload an mp3 file" isOpen={uploadModal.isOpen} onChange={onChange}>
      <form className="flex flex-col gap-y-4" onSubmit={handleSubmit(onSubmit)}>
<Input id='title' disabled={isLoading} {...register('title',{required:true})} placeholder='Song title'/>
<Input id='author' disabled={isLoading} {...register('author',{required:true})} placeholder='Song author'/>
<div>
  <div className="pb-1">
    Select song file
<Input id='song' type="file" disabled={isLoading} accept='.mp3' {...register('song',{required:true})}/>

  </div>
</div>
<div>
  <div className="pb-1">
    Select an image
<Input id='image' type="file" disabled={isLoading} accept='image/*' {...register('image',{required:true})}/>

  </div>
</div>
<Button disabled={isLoading} type="submit">Create</Button>
      </form>
    </Modal>
)
}