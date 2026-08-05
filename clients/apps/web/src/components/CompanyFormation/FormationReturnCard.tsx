'use client'

import { useEffect, useState } from 'react'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import { Card, CardContent, CardFooter, CardHeader } from '@spaire/ui/components/atoms/Card'
import Link from 'next/link'
import { FORMATION_STARTED_KEY, type FormationStartedData } from './types'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

const NEXT_STEPS = [
  'Set up billing with Stripe',
  'Create your first product',
  'Launch subscriptions',
  'Access startup perks',
] as const

export default function FormationReturnCard() {
  const [formation, setFormation] = useState<FormationStartedData | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(FORMATION_STARTED_KEY)
    if (!stored) return

    try {
      const data: FormationStartedData = JSON.parse(stored)
      // Auto-expire after 30 days
      const startedAt = new Date(data.startedAt).getTime()
      if (Date.now() - startedAt > THIRTY_DAYS_MS) {
        localStorage.removeItem(FORMATION_STARTED_KEY)
        return
      }
      setFormation(data)
    } catch {
      localStorage.removeItem(FORMATION_STARTED_KEY)
    }
  }, [])

  if (!formation) return null

  const handleDismiss = () => {
    localStorage.removeItem(FORMATION_STARTED_KEY)
    setFormation(null)
  }

  return (
    <Card className="border-blue-200 bg-blue-50 ">
      <CardHeader className="pb-2">
        <h3 className="text-lg font-semibold">
          Finish Setting Up {formation.companyName}
        </h3>
        <p className=" text-sm text-gray-600">
          You&apos;re forming your company with doola. Once completed, come
          back here to:
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {NEXT_STEPS.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 text-sm"
            >
              <CheckCircleOutlined
                className="text-green-500"
                style={{ fontSize: 16 }}
              />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="gap-2 pt-2">
        <Link href="products/new">
          <Button size="sm">Continue Setup</Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={handleDismiss}>
          Dismiss
        </Button>
      </CardFooter>
    </Card>
  )
}
