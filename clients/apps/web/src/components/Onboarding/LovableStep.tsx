'use client'

import { useOnboardingTracking } from '@/hooks'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import { useRouter } from 'next/navigation'
import { useCallback, useContext, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { twMerge } from 'tailwind-merge'
import { FadeUp } from '../Animated/FadeUp'
import LogoIcon from '../Brand/LogoIcon'
import LovableIcon from '../Icons/frameworks/lovable'
import { OnboardingStepper } from './OnboardingStepper'

const LOVABLE_PROMPT = `Add Spaire payment checkout to my app. Spaire is my billing provider — it handles payments through a hosted checkout overlay. No API keys or environment variables needed in the frontend.

Here's how it works:
- Spaire uses checkout links (simple URLs) that open a secure payment overlay on top of your app
- No backend code, no API keys, no .env variables — just a script tag and links

Please do the following:

1. Add this script tag to index.html, right before the closing </body> tag:

<script defer data-auto-init src="https://cdn.spairehq.com/checkout/embed.js"></script>

2. Create a /pricing page with a clean layout showing plan cards. For each plan's call-to-action button, use an anchor tag like this:

<a href="CHECKOUT_LINK_URL" data-spaire-checkout data-spaire-checkout-theme="light">
  Get Started
</a>

Use "CHECKOUT_LINK_URL" as a placeholder — I'll replace it with my actual checkout link from the Spaire dashboard after I create my products there.

3. When a user clicks the button, Spaire's checkout overlay will open automatically (handled by the script). No onClick handler needed.

4. Create a /checkout/success page that displays a confirmation message after a successful purchase.

5. Style the pricing page and success page to match the rest of the app's design.`

export const LovableStep = () => {
  const [promptCopied, setPromptCopied] = useState(false)

  const { organization } = useContext(OrganizationContext)
  const router = useRouter()
  const {
    trackStepStarted,
    trackStepCompleted,
    trackStepSkipped,
    getSession,
  } = useOnboardingTracking()

  useEffect(() => {
    const session = getSession()
    if (session) {
      trackStepStarted('lovable', organization.id)
    }
  }, [organization.id, getSession, trackStepStarted])

  const handleContinue = async () => {
    const session = getSession()
    if (session) {
      await trackStepCompleted('lovable', organization.id)
    }
    router.push(`/dashboard/${organization.slug}`)
  }

  const handleSkip = async () => {
    const session = getSession()
    if (session) {
      await trackStepSkipped('lovable', organization.id)
    }
    router.push(`/dashboard/${organization.slug}`)
  }

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(LOVABLE_PROMPT)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 2500)
  }, [])

  return (
    <div className=" flex h-full w-full flex-row">
      <OnboardingStepper currentStep={1} />

      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex w-full flex-col items-center px-6 pt-16 pb-24 md:px-20">
          <motion.div
            initial="hidden"
            animate="visible"
            transition={{ duration: 1, staggerChildren: 0.2 }}
            className="flex w-full max-w-2xl flex-col gap-16"
          >
            {/* Skip link */}
            <FadeUp className="flex flex-row justify-end">
              <button
                className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
                onClick={handleSkip}
              >
                Not using Lovable? Skip this step
              </button>
            </FadeUp>

            {/* Header */}
            <FadeUp className="flex flex-col gap-y-4">
              <div className="md:hidden mb-8">
                <LogoIcon size={36} />
              </div>
              <LovableIcon size={40} />
              <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
                Build with Lovable. Monetize with Spaire.
              </h1>
              <p className=" max-w-lg text-base leading-relaxed text-gray-500">
                Spaire partners with Lovable to bring billing directly into your
                app. Just copy the prompt below, paste it into Lovable, and
                you&apos;ll have a fully working checkout page.
              </p>
            </FadeUp>

            {/* How it works */}
            <FadeUp className="flex flex-col gap-y-5">
              <h2 className="text-sm font-medium uppercase tracking-wider text-gray-400">
                How it works
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <HowItWorksCard
                  number={1}
                  title="Copy prompt"
                  description="Grab the ready-made prompt below"
                />
                <HowItWorksCard
                  number={2}
                  title="Paste in Lovable"
                  description="Lovable builds your pricing page"
                />
                <HowItWorksCard
                  number={3}
                  title="Add checkout links"
                  description="Drop in your Spaire URLs after creating products"
                />
              </div>
            </FadeUp>

            {/* Prompt Card */}
            <FadeUp className="flex flex-col gap-y-4">
              <div className="flex flex-row items-center justify-between">
                <h2 className="text-base font-medium">Lovable prompt</h2>
                <button
                  onClick={handleCopyPrompt}
                  className={twMerge(
                    'flex items-center gap-x-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all',
                    promptCopied
                      ? 'bg-emerald-50 text-emerald-600 '
                      : '  bg-gray-100 text-gray-600 hover:bg-gray-200',
                  )}
                >
                  {promptCopied ? (
                    <>
                      <CheckOutlined sx={{ fontSize: 14 }} />
                      Copied
                    </>
                  ) : (
                    <>
                      <ContentCopyOutlined sx={{ fontSize: 14 }} />
                      Copy Prompt
                    </>
                  )}
                </button>
              </div>
              <div className=" relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-950">
                <div className=" flex flex-row items-center gap-x-2 border-b border-gray-800 bg-gray-900 px-5 py-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-400/60" />
                  <span className="ml-2 text-[11px] text-gray-500">
                    lovable-prompt.txt
                  </span>
                </div>
                <div className="max-h-[400px] overflow-y-auto p-6">
                  <pre className="whitespace-pre-wrap font-mono text-[13px] leading-[1.8] text-gray-300">
                    {LOVABLE_PROMPT}
                  </pre>
                </div>
              </div>
              <p className=" text-xs leading-relaxed text-gray-400">
                After creating your product in the next step, you&apos;ll get a
                checkout link URL from the Spaire dashboard to replace the{' '}
                <code className=" rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium">
                  CHECKOUT_LINK_URL
                </code>{' '}
                placeholder above.
              </p>
            </FadeUp>

            {/* Actions */}
            <FadeUp className="flex flex-col gap-y-3 pt-2">
              <Button size="lg" fullWidth onClick={handleContinue}>
                Continue to Create Product
              </Button>
              <div className="flex flex-row items-center justify-center pt-1">
                <button
                  className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
                  onClick={handleSkip}
                >
                  Not using Lovable? Skip this step
                </button>
              </div>
            </FadeUp>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

const HowItWorksCard = ({
  number,
  title,
  description,
}: {
  number: number
  title: string
  description: string
}) => (
  <div className=" flex flex-col gap-y-3 rounded-2xl border border-gray-200 bg-white p-5">
    <span className=" flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
      {number}
    </span>
    <div className="flex flex-col gap-y-1">
      <span className="text-sm font-medium">{title}</span>
      <span className=" text-xs leading-relaxed text-gray-400">
        {description}
      </span>
    </div>
  </div>
)
