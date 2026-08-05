'use client'

import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@spaire/ui/components/atoms/Card'
import type { RecommendationOutput } from './recommendation'
import { US_STATE_NAMES } from './recommendation'

interface FormationRecommendationCardProps {
  recommendation: RecommendationOutput
  onAccept: () => void
  onOverride: () => void
}

export default function FormationRecommendationCard({
  recommendation,
  onAccept,
  onOverride,
}: FormationRecommendationCardProps) {
  const entityLabel =
    recommendation.entity_type === 'C_CORP' ? 'C-Corporation' : 'LLC'
  const stateLabel =
    US_STATE_NAMES[recommendation.formation_state] ??
    recommendation.formation_state

  return (
    <Card className="border-blue-200 bg-blue-50 ">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AccountBalanceOutlined
            className="text-blue-600"
            fontSize="small"
          />
          <span className="text-sm font-medium text-blue-600">
            Recommended Structure
          </span>
          {recommendation.confidence === 'high' && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 ">
              High confidence
            </span>
          )}
        </div>
        <h3 className="text-xl font-semibold">
          {stateLabel} {entityLabel}
        </h3>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm font-medium text-gray-700">
          Why this recommendation?
        </p>
        <ul className="space-y-1.5">
          {recommendation.reasons.map((reason, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-gray-600"
            >
              <CheckCircleOutlined
                className="mt-0.5 shrink-0 text-green-500"
                style={{ fontSize: 16 }}
              />
              {reason}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="gap-2 pt-2">
        <Button onClick={onAccept} size="sm">
          Accept recommendation
        </Button>
        <Button onClick={onOverride} variant="ghost" size="sm">
          Choose a different structure
        </Button>
      </CardFooter>
    </Card>
  )
}
