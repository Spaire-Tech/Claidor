'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { FadeUp } from '../Animated/FadeUp'

const formationFeatures = [
  {
    heading: 'Company formation',
    items: [
      'Delaware LLC or C-Corporation',
      'State filing handled for you',
      'Articles of Incorporation / Organization',
    ],
  },
  {
    heading: 'Business essentials',
    items: [
      'EIN (IRS tax ID)',
      'Operating agreement or corporate bylaws',
      'Registered agent',
    ],
  },
  {
    heading: 'Financial setup',
    items: [
      'Help opening a US business bank account',
      'Access to bookkeeping tools',
    ],
  },
  {
    heading: 'Ongoing compliance',
    items: [
      'Annual compliance reminders',
      'Support with required filings',
    ],
  },
]

export default function FormationDetailPage() {
  const params = useParams<{ organization: string }>()
  const orgSlug = params?.organization

  return (
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
              href={`/dashboard/${orgSlug}/founder-tools`}
              className="flex cursor-pointer items-center gap-x-1.5 rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
            >
              <ArrowBackOutlined sx={{ fontSize: 16 }} />
              Incorporate
            </Link>
          </FadeUp>

          {/* Header */}
          <FadeUp className="flex flex-col gap-y-4">
            <div className="flex items-center gap-x-3">
              <img
                src="/doola-logo.png"
                alt="doola"
                className="h-10 w-10 rounded-xl object-contain"
              />
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600 ">
                Powered by doola
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
              Company Formation
            </h1>
            <p className=" max-w-lg text-base leading-relaxed text-gray-500">
              Start a US company in minutes and get everything you need to
              operate your startup legally.
            </p>
          </FadeUp>

          {/* Price */}
          <FadeUp className="flex flex-col gap-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-400">
              Formation price
            </h2>
            <div className=" flex items-baseline gap-x-2 rounded-2xl border border-gray-200 bg-white p-6 ">
              <span className="text-2xl font-semibold tracking-tight">
                Starting at $297
              </span>
              <span className=" text-base text-gray-500">
                + state fees
              </span>
            </div>
          </FadeUp>

          {/* What you get */}
          <FadeUp className="flex flex-col gap-y-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-400">
              What you get
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {formationFeatures.map((section) => (
                <div
                  key={section.heading}
                  className=" flex flex-col gap-y-4 rounded-2xl border border-gray-200 bg-white p-6 "
                >
                  <h3 className="text-sm font-medium">{section.heading}</h3>
                  <ul className="flex flex-col gap-y-2.5">
                    {section.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-x-2.5"
                      >
                        <CheckOutlined
                          sx={{ fontSize: 16 }}
                          className="mt-0.5 shrink-0 text-emerald-500"
                        />
                        <span className=" text-sm leading-relaxed text-gray-500">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </FadeUp>

          {/* CTA */}
          <FadeUp className="flex flex-col gap-y-3 pt-2">
            <Link
              href={`/dashboard/${orgSlug}/founder-tools/new`}
              className="w-full"
            >
              <Button size="lg" fullWidth type="button">
                <span>Start incorporation</span>
                <ArrowForwardOutlined className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <div className="flex flex-row items-center justify-center pt-1">
              <Link
                href={`/dashboard/${orgSlug}/founder-tools`}
                className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
              >
                Back to Incorporate
              </Link>
            </div>
          </FadeUp>
        </motion.div>
      </div>
    </DashboardBody>
  )
}
