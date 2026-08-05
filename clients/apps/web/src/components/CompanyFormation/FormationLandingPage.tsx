'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import ShadowBoxOnMd from '@spaire/ui/components/atoms/ShadowBoxOnMd'
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function FormationLandingPage() {
  const params = useParams<{ organization: string }>()
  const orgSlug = params?.organization

  return (
    <DashboardBody title="Start a U.S. Company From Anywhere">
      <ShadowBoxOnMd className="items-center justify-center gap-y-6 md:flex md:flex-col md:py-24">
        <div className="flex max-w-md flex-col items-center gap-y-6 text-center">
          <div className="flex items-center gap-x-4">
            <img
              src="/doola-logo.png"
              alt="doola"
              className="h-12 w-12 rounded-xl object-contain"
            />
            <span className=" text-2xl text-gray-300">×</span>
            <img
              src="/spaire-logo.png"
              alt="Spaire"
              className="h-12 w-12 rounded-xl object-contain"
            />
            <img
              src="/spaire-logo.png"
              alt="Spaire"
              className="hidden h-12 w-12 rounded-xl object-contain"
            />
          </div>
          <div className="flex flex-col items-center gap-y-2">
            <h3 className="text-xl font-medium">
              Incorporate your Startup
            </h3>
            <p className=" text-gray-500">
              Spaire partners with Doola to help you form a US company in
              minutes — no matter where you are in the world. Get the legal
              foundation your startup needs to open a bank account, raise
              funding, and start selling.
            </p>
          </div>
          <Link href={`/dashboard/${orgSlug}/founder-tools/details`}>
            <Button role="link">
              <ArrowForwardOutlined className="h-4 w-4" />
              <span>Get Started</span>
            </Button>
          </Link>
        </div>
      </ShadowBoxOnMd>
    </DashboardBody>
  )
}
