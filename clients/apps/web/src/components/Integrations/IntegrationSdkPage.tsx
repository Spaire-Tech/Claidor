'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import ArrowOutwardOutlined from '@mui/icons-material/ArrowOutwardOutlined'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import Button from '@spaire/ui/components/atoms/Button'
import { Tabs, TabsList, TabsTrigger } from '@spaire/ui/components/atoms/Tabs'
import Link from 'next/link'
import { useContext, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FadeUp } from '../Animated/FadeUp'
import OrganizationAccessTokensSettings from '../Settings/OrganizationAccessTokensSettings'
import {
  SyntaxHighlighterClient,
  SyntaxHighlighterProvider,
} from '../SyntaxHighlighterShiki/SyntaxHighlighterClient'
import type { SdkIntegration } from './integrations'

const packageManagers = ['pnpm', 'npm', 'yarn', 'bun'] as const
type PackageManager = (typeof packageManagers)[number]

const getInstallCommand = (
  packages: string,
  packageManager: PackageManager,
): string => {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm add ${packages}`
    case 'npm':
      return `npm install ${packages}`
    case 'yarn':
      return `yarn add ${packages}`
    case 'bun':
      return `bun add ${packages}`
  }
}

interface IntegrationSdkPageProps {
  integration: SdkIntegration
  icon: React.ReactNode
}

export default function IntegrationSdkPage({
  integration,
  icon,
}: IntegrationSdkPageProps) {
  const { organization } = useContext(OrganizationContext)
  const [packageManager, setPackageManager] = useState<PackageManager>('pnpm')
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  const installCommand = useMemo(() => {
    if (integration.pythonInstall) {
      return integration.pythonInstall
    }
    return getInstallCommand(integration.packages, packageManager)
  }, [integration, packageManager])

  const isPython = integration.codeLang === 'python'
  const isNonJs = isPython || integration.codeLang === 'go' || integration.codeLang === 'php'

  const envVarsWithToken = useMemo(() => {
    if (createdToken) {
      return integration.envVars.replace('your_access_token', createdToken)
    }
    return integration.envVars
  }, [integration.envVars, createdToken])

  return (
    <SyntaxHighlighterProvider>
      <DashboardBody title={null}>
        <div className="flex w-full flex-col items-center pb-16">
          <motion.div
            initial="hidden"
            animate="visible"
            transition={{ duration: 1, staggerChildren: 0.2 }}
            className="flex w-full max-w-2xl flex-col gap-16"
          >
            {/* Back link */}
            <FadeUp className="flex flex-row justify-start">
              <Link
                href={`/dashboard/${organization.slug}/integrations`}
                className="flex cursor-pointer items-center gap-x-1.5 rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
              >
                <ArrowBackOutlined sx={{ fontSize: 16 }} />
                All Integrations
              </Link>
            </FadeUp>

            {/* Header */}
            <FadeUp className="flex flex-col gap-y-4">
              <div className="flex items-center gap-x-3">
                {icon}
                <span className=" rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  {integration.categoryLabel}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
                {integration.tagline}
              </h1>
              <p className=" max-w-lg text-base leading-relaxed text-gray-500">
                {integration.description}
              </p>
            </FadeUp>

            {/* How it works */}
            <FadeUp className="flex flex-col gap-y-5">
              <h2 className="text-sm font-medium uppercase tracking-wider text-gray-400">
                How it works
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {integration.howItWorks.map((step, i) => (
                  <HowItWorksCard
                    key={i}
                    number={i + 1}
                    title={step.title}
                    description={step.description}
                  />
                ))}
              </div>
            </FadeUp>

            {/* 1. Install Dependencies */}
            <FadeUp className="flex flex-col gap-y-6">
              <div className="flex flex-row items-center justify-between">
                <h2 className="text-base font-medium">
                  1. Install Dependencies
                </h2>
                {!isNonJs && (
                  <Tabs
                    value={packageManager}
                    onValueChange={(v) =>
                      setPackageManager(v as PackageManager)
                    }
                  >
                    <TabsList className=" rounded-sm bg-gray-100 p-0.5">
                      {packageManagers.map((pm) => (
                        <TabsTrigger
                          key={pm}
                          value={pm}
                          className=" !rounded-sm px-2.5 py-1 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                          {pm}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}
              </div>
              <CodeWrapper>
                <SyntaxHighlighterClient lang="bash" code={installCommand} />
              </CodeWrapper>
            </FadeUp>

            {/* 2. Configure Environment */}
            <FadeUp className="flex flex-col gap-y-6">
              <h2 className="text-base font-medium">
                2. Configure Environment
              </h2>
              <OrganizationAccessTokensSettings
                organization={organization}
                singleTokenMode
                minimal
                onTokenCreated={setCreatedToken}
              />
              <CodeWrapper>
                <SyntaxHighlighterClient
                  lang="bash"
                  code={envVarsWithToken}
                />
              </CodeWrapper>
            </FadeUp>

            {/* 3. Add Checkout Code */}
            <FadeUp className="flex flex-col gap-y-6">
              <h2 className="text-base font-medium">3. Add Checkout Code</h2>
              <CodeWrapper>
                <SyntaxHighlighterClient
                  lang={integration.codeLang === 'python' ? 'python' : integration.codeLang === 'go' ? 'go' : integration.codeLang === 'php' ? 'php' : 'typescript'}
                  code={integration.code}
                />
              </CodeWrapper>
            </FadeUp>

            {/* Actions */}
            <FadeUp className="flex flex-col gap-y-3 pt-2">
              <Link
                href={integration.docsLink}
                target="_blank"
                className="w-full"
              >
                <Button size="lg" fullWidth>
                  <span>Read the Docs</span>
                  <ArrowOutwardOutlined className="ml-2" fontSize="small" />
                </Button>
              </Link>
              <div className="flex flex-row items-center justify-center pt-1">
                <Link
                  href={`/dashboard/${organization.slug}/integrations`}
                  className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
                >
                  Back to all integrations
                </Link>
              </div>
            </FadeUp>
          </motion.div>
        </div>
      </DashboardBody>
    </SyntaxHighlighterProvider>
  )
}

const CodeWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className=" w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
      {children}
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
