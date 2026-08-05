'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import ArrowOutwardOutlined from '@mui/icons-material/ArrowOutwardOutlined'
import Link from 'next/link'
import { useContext } from 'react'
import AstroIcon from '../Icons/frameworks/astro'
import BetterAuthIcon from '../Icons/frameworks/better-auth'
import BoltIcon from '../Icons/frameworks/bolt'
import ElysiaIcon from '../Icons/frameworks/elysia'
import ExpressIcon from '../Icons/frameworks/express'
import FastifyIcon from '../Icons/frameworks/fastify'
import HonoIcon from '../Icons/frameworks/hono'
import LaravelIcon from '../Icons/frameworks/laravel'
import LovableIcon from '../Icons/frameworks/lovable'
import NextJsIcon from '../Icons/frameworks/nextjs'
import NuxtIcon from '../Icons/frameworks/nuxt'
import PhpIcon from '../Icons/frameworks/php'
import PythonIcon from '../Icons/frameworks/python'
import RemixIcon from '../Icons/frameworks/remix'
import ReplitIcon from '../Icons/frameworks/replit'
import RubyIcon from '../Icons/frameworks/ruby'
import SupabaseIcon from '../Icons/frameworks/supabase'
import SvelteKitIcon from '../Icons/frameworks/sveltekit'
import TanStackIcon from '../Icons/frameworks/tanstack'
import TypeScriptIcon from '../Icons/frameworks/typescript'
import V0Icon from '../Icons/frameworks/v0'
import { ALL_INTEGRATIONS, type Integration } from './integrations'

const INTEGRATION_ICONS: Record<string, React.ReactNode> = {
  'typescript-sdk': <TypeScriptIcon size={36} />,
  nextjs: <NextJsIcon size={36} />,
  'ruby-sdk': <RubyIcon size={36} />,
  astro: <AstroIcon size={36} />,
  elysia: <ElysiaIcon size={36} />,
  fastify: <FastifyIcon size={36} />,
  hono: <HonoIcon size={36} />,
  laravel: <LaravelIcon size={36} />,
  nuxt: <NuxtIcon size={36} />,
  remix: <RemixIcon size={36} />,
  sveltekit: <SvelteKitIcon size={36} />,
  'tanstack-start': <TanStackIcon size={36} />,
  lovable: <LovableIcon size={36} />,
  supabase: <SupabaseIcon size={36} />,
  v0: <V0Icon size={36} />,
  replit: <ReplitIcon size={36} />,
  bolt: <BoltIcon size={36} />,
  'better-auth': <BetterAuthIcon size={36} />,
  express: <ExpressIcon size={36} />,
  'python-sdk': <PythonIcon size={36} />,
  'php-sdk': <PhpIcon />,
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'ai-builder': {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
  },
  backend: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
  },
  framework: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
  },
  auth: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
  },
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const { organization } = useContext(OrganizationContext)
  const icon = INTEGRATION_ICONS[integration.slug]
  const colors = CATEGORY_COLORS[integration.category] ?? {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
  }
  const isComingSoon = integration.comingSoon

  const content = (
    <div
      className={`group flex flex-col gap-y-5 rounded-2xl border border-gray-200 p-6 transition-all ${
        isComingSoon
          ? 'cursor-default opacity-60'
          : ' hover:border-gray-300 hover:shadow-md'
      }`}
    >
      <div className="flex flex-row items-start justify-between">
        <div className="flex items-center gap-x-3">
          <div className={isComingSoon ? 'grayscale' : ''}>{icon}</div>
          <div className="flex flex-col gap-y-0.5">
            <h3 className="text-base font-medium">
              {integration.name}
            </h3>
            <span className={`text-[11px] font-medium ${isComingSoon ? ' text-gray-400' : colors.text}`}>
              {integration.categoryLabel}
            </span>
          </div>
        </div>
        {isComingSoon ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-500 ">
            Coming Soon
          </span>
        ) : (
          <ArrowOutwardOutlined className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-500 " />
        )}
      </div>

      <p className=" text-sm leading-relaxed text-gray-500">
        {integration.description}
      </p>
    </div>
  )

  if (isComingSoon) {
    return content
  }

  return (
    <Link
      href={`/dashboard/${organization.slug}/integrations/${integration.slug}`}
    >
      {content}
    </Link>
  )
}

export default function IntegrationsPage() {
  return (
    <DashboardBody title="Integrations">
      <div className="flex flex-col gap-y-2">
        <p className=" text-sm text-gray-500">
          Connect Spaire to your favorite tools. Copy a prompt, paste it into
          your AI builder, or integrate with our SDK — and start accepting
          payments in minutes.
        </p>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ALL_INTEGRATIONS.map((integration) => (
          <IntegrationCard key={integration.slug} integration={integration} />
        ))}
      </div>
    </DashboardBody>
  )
}
