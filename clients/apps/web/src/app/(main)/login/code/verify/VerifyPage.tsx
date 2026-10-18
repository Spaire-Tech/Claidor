'use client'

import { CONFIG } from '@/utils/config'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@simeon/ui/components/atoms/InputOTP'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@simeon/ui/components/ui/form'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

const ClientPage = ({
  return_to,
  error,
  email,
}: {
  return_to?: string
  error?: string
  email?: string
}) => {
  const form = useForm<{ code: string }>()
  const { control, setError } = form

  const urlSearchParams = new URLSearchParams({
    ...(return_to && { return_to }),
    ...(email && { email }),
  })

  // Set error from urlparams
  useEffect(() => {
    if (error) {
      setError('code', { message: error })
    }
  }, [error, setError])

  const [loading, setLoading] = useState(false)
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    e.currentTarget.submit()
  }

  const formRef = useRef<HTMLFormElement>(null)

  return (
    <Form {...form}>
      <form
        ref={formRef}
        className="flex w-full flex-col items-center gap-y-5"
        action={`${CONFIG.BASE_URL}/v1/login-code/authenticate?${urlSearchParams.toString()}`}
        method="POST"
        onSubmit={onSubmit}
      >
        <FormField
          control={control}
          name="code"
          render={({ field }) => {
            return (
              <FormItem>
                <FormControl>
                  <InputOTP
                    maxLength={6}
                    pattern="^[a-zA-Z0-9]+$"
                    inputMode="text"
                    {...field}
                    autoFocus={true}
                    onChange={(value) => field.onChange(value.toUpperCase())}
                    onComplete={() => {
                      if (formRef.current) {
                        setLoading(true)
                        formRef.current.submit()
                      }
                    }}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot
                          key={index}
                          index={index}
                          className="h-12 w-11 border-[#d9d9de] bg-white text-xl text-[#1d1d1f] sm:h-14 sm:w-12 sm:text-2xl"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormMessage className="text-center" />
              </FormItem>
            )
          }}
        />
        <button
          type="submit"
          disabled={loading}
          className="h-[52px] w-full rounded-[12px] bg-black text-[17px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#1d1d1f] disabled:opacity-60"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Form>
  )
}

export default ClientPage
