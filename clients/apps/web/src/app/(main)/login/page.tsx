import Login from '@/components/Auth/Login'
import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Log in to Ances',
}

export default async function Page(props: {
  searchParams: Promise<{
    return_to?: string
  }>
}) {
  const searchParams = await props.searchParams

  const { return_to, ...rest } = searchParams

  return (
    <div className="flex h-screen w-full grow items-center justify-center">
      <div className="flex w-full max-w-md flex-col justify-between gap-16 rounded-4xl bg-gray-50 p-12">
        <div className="flex flex-col gap-y-8">
          <span
            style={{
              fontFamily: "'Bodoni Moda', Didot, Georgia, serif",
              fontSize: 44,
              lineHeight: 1,
              color: '#1d1d1f',
            }}
          >
            A
          </span>
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl text-black">Welcome back to Ances</h2>
            <h2 className="text-lg text-gray-500">
              Every check an auditor runs on a model, run on yours.
            </h2>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Login returnTo={return_to} returnParams={rest} />
          <p className="text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link href="/signup" className="text-blue-500 hover:text-blue-600">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
