import Login from '@/components/Auth/Login'
import LogoIcon from '@/components/Brand/LogoIcon'
import { Metadata } from 'next'
import Link from 'next/link'

// The private copy of sign-up, the pair of /login/draft: unlisted, not
// indexed, signing people up for real through the same Login component as
// /signup. Starts from the earlier product's card (design/ in this app).
export const metadata: Metadata = {
  title: 'Sign up to Simeon (draft)',
  robots: { index: false, follow: false },
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
          <LogoIcon className="text-blue-500" size={60} />
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl text-black">Sign up to Simeon</h2>
            <h2 className="text-lg text-gray-500">
              Your team of agents, always on.
            </h2>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Login
            returnTo={return_to}
            returnParams={rest}
            signup={{ intent: 'creator' }}
          />
          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link
              href="/login/draft"
              className="text-blue-500 hover:text-blue-600"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
