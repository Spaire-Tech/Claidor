import PublicLayout from '@/components/Layout/PublicLayout'
import {
  ForceLightMode,
  forceLightModeBeforeHydration,
} from '@/components/Profile/ForceLightMode'
import { ProfileCard } from '@/components/Profile/ProfileCard'
import { SpaceDocumentBackground } from '@/components/Profile/SpaceDocumentBackground'
import { getServerSideAPI } from '@/utils/client/serverside'
import { getStorefrontOrNotFound } from '@/utils/storefront'
import { cn } from '@spaire/ui/lib/utils'
import React from 'react'
import '@/styles/space-dark.css'

export default async function Layout(props: {
  params: Promise<{ organization: string }>
  children: React.ReactNode
}) {
  const params = await props.params

  const { children } = props

  const api = await getServerSideAPI()

  const { organization, products } = await getStorefrontOrNotFound(
    api,
    params.organization,
  )

  // Publishable Space theme — when the creator sets theme = 'dark', the public
  // page renders in the same scoped dark palette the editor previews.
  const settings = (
    'storefront_settings' in organization ? organization.storefront_settings : null
  ) as { theme?: 'light' | 'dark' } | null
  const dark = settings?.theme === 'dark'

  return (
    <div
      className={cn(
        'min-h-screen bg-white text-gray-900',
        dark && 'space-dark',
      )}
    >
      {/* Strip dark mode synchronously, before hydration, so dark-theme
          users don't flash dark styles on a public Space page. */}
      <script
        dangerouslySetInnerHTML={{ __html: forceLightModeBeforeHydration }}
      />
      <ForceLightMode />
      {/* Paint the document background to the Space theme so a dark Space has no
          white canvas at the bottom / on overscroll (covers product pages too,
          which share this layout). */}
      <SpaceDocumentBackground dark={dark} />
      <PublicLayout className="gap-y-0 py-4 md:py-8" wide footer={false}>
        {/* Two-column layout — no topbar, no login, no nav tabs */}
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          {/* Left column — Profile card (sticky on desktop) */}
          <aside data-profile-card className="w-full shrink-0 md:sticky md:top-8 md:w-[420px] md:self-start">
            <ProfileCard organization={organization} products={products} />
          </aside>

          {/* Right column — Products directly */}
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-full grow flex-col">
              {children}
            </div>
          </main>
        </div>
      </PublicLayout>
    </div>
  )
}
