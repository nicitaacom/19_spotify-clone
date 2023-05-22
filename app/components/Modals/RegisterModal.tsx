'use client'

import axios from 'axios'
import {AiFillGithub} from 'react-icons/ai'
import {FcGoogle} from 'react-icons/fc'
import { useCallback,useState } from 'react'
import {FieldValues,SubmitHandler,useForm} from 'react-hook-form'
import useRegisterModal from '@/app/hooks/useRegisterModal'
import Modal from './Modal'
import Heading from '../Heading'
import Input from '../inputs/Input'
import toast from 'react-hot-toast'
import Button from '../Button'

const RegisterModal = () => {
  const registerModal = useRegisterModal()
  const [isLoading,setIsLoading] = useState(false)

  const {register,handleSubmit,formState:{errors}} = useForm<FieldValues>({
    defaultValues:{
      name:'',
      email:'',
      password:''
    }
  })

  const onSubmit:SubmitHandler<FieldValues> = (data) => {
    setIsLoading(true)

    axios.post('/api/register',data)
    .then(() => {
      registerModal.onClose()
    })
    .catch((error) => {
      toast.error('Something went wrong')
    })
    .finally(() => {
      setIsLoading(false)
    })
  }

  const bodyContent = (
    <div className='flex flex-col gap-4'>
      <Heading title='Welcome to airbnb' subTitle='Create an account!'/>
      <Input id='name' label='Name' disabled={isLoading} register={register} errors={errors} required/>
      <Input id='email' label='Email' disabled={isLoading} register={register} errors={errors} required/>
      <Input id='password' label='Password' disabled={isLoading} register={register} errors={errors} required/>
    </div>
  )

  const footerContent = (
    <div className='flex flex-col gap-4 mt-3'>
      <hr />
      <Button outline label='Continue with google' icon={FcGoogle} onClick={() => {}}/>
      <Button outline label='Continue with google' icon={AiFillGithub} onClick={() => {}}/>
      <div className='text-neutral-500 text-center mt-4 font-light'>
        <div className='flex justify-center flex-row items-center gap-2'>
          <div>
            Already have an account?
          </div>
          <div className='text-neutral-800 cursor-pointer hover:underline'
          onClick={registerModal.onClose}>
            Log in
          </div>
        </div>
      </div>
    </div>
  )

  return ( 
    <Modal title='Register' actionLabel='Continue' onClose={registerModal.onClose}
    onSubmit={handleSubmit(onSubmit)} disabled={isLoading} isOpen={registerModal.isOpen} 
    body={bodyContent} footer={footerContent}/>
   );
}
 
export default RegisterModal;