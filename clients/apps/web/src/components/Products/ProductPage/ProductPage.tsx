import { ConfirmModal } from '@/components/Modal/ConfirmModal'
import { useModal } from '@/components/Modal/useModal'
import { toast } from '@/components/Toast/use-toast'
import { useMetrics, useUpdateProduct } from '@/hooks/queries'
import { apiErrorToast } from '@/utils/api/errors'
import { getChartRangeParams } from '@/utils/metrics'
import MoreVert from '@mui/icons-material/MoreVert'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import { Status } from '@spaire/ui/components/atoms/Status'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@spaire/ui/components/atoms/Tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { DashboardBody } from '../../Layout/DashboardLayout'
import { ProductThumbnail } from '../ProductThumbnail'
import { ProductMetricsView } from './ProductMetricsView'
import { ProductOverview } from './ProductOverview'

const ProductTypeDisplayColor: Record<string, string> = {
  subscription: 'bg-emerald-100 text-emerald-500',
  one_time:
    'bg-blue-100 text-blue-500 ',
}

export interface ProductPageProps {
  organization: schemas['Organization']
  product: schemas['Product']
}

export const ProductPage = ({ organization, product }: ProductPageProps) => {
  const [allTimeStart, allTimeEnd, allTimeInterval] = getChartRangeParams(
    'all_time',
    product.created_at,
  )
  const { data: metrics, isLoading: metricsLoading } = useMetrics({
    organization_id: organization.id,
    product_id: [product.id],
    startDate: allTimeStart,
    endDate: allTimeEnd,
    interval: allTimeInterval,
    metrics: product.is_recurring
      ? [
          // Subscription metrics
          'monthly_recurring_revenue',
          'committed_monthly_recurring_revenue',
          'active_subscriptions',
          'new_subscriptions',
          'renewed_subscriptions',
          'new_subscriptions_revenue',
          'renewed_subscriptions_revenue',
          // Order metrics
          'revenue',
          'orders',
          'average_order_value',
          'cumulative_revenue',
        ]
      : [
          // One-time metrics
          'one_time_products',
          'one_time_products_revenue',
          // Order metrics (excluding revenue and orders for one-time)
          'average_order_value',
          'cumulative_revenue',
        ],
  })
  const { data: todayMetrics } = useMetrics({
    organization_id: organization.id,
    startDate: new Date(),
    endDate: new Date(),
    interval: 'day',
    product_id: [product.id],
    metrics: ['revenue'],
  })

  const updateProduct = useUpdateProduct(organization)
  const router = useRouter()

  const {
    isShown: isArchiveModalShown,
    hide: hideArchiveModal,
    show: showArchiveModal,
  } = useModal()

  const {
    isShown: isUnarchiveModalShown,
    hide: hideUnarchiveModal,
    show: showUnarchiveModal,
  } = useModal()

  const handleArchiveProduct = useCallback(async () => {
    const { error } = await updateProduct.mutateAsync({
      id: product.id,
      body: { is_archived: true },
    })

    if (error) {
      apiErrorToast(error, toast, {
        title: 'Error Archiving Masterclass',
      })
      return
    }

    toast({
      title: 'Masterclass Archived',
      description: 'Masterclass has been successfully archived',
    })
  }, [product, updateProduct])

  const handleUnarchiveProduct = useCallback(async () => {
    const { error } = await updateProduct.mutateAsync({
      id: product.id,
      body: { is_archived: false },
    })

    if (error) {
      apiErrorToast(error, toast, {
        title: 'Error Unarchiving Masterclass',
      })
      return
    }

    toast({
      title: 'Masterclass Unarchived',
      description: 'Masterclass has been successfully unarchived',
    })
  }, [product, updateProduct])

  return (
    <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
      <DashboardBody
        title={
          <div className="flex min-w-0 flex-row items-center gap-4">
            <div className="flex min-w-0 flex-row items-center gap-4">
              <ProductThumbnail product={product} />
              <h1 className="truncate text-2xl">{product.name}</h1>
            </div>

            <div className="flex flex-row items-center gap-4">
              <Status
                status={
                  product.is_recurring ? 'Subscription' : 'One-time Masterclass'
                }
                className={
                  ProductTypeDisplayColor[
                    product.is_recurring ? 'subscription' : 'one_time'
                  ]
                }
              />
              {product.is_archived && (
                <Status
                  status="Archived"
                  className="bg-red-100 text-red-500"
                />
              )}
            </div>
          </div>
        }
        header={
          <div className="flex flex-row items-center justify-end gap-2">
            {/* "Edit Product" is gone on purpose: the masterclass builder owns
                title, description, pricing, and media now. */}
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="secondary">
                    <MoreVert fontSize="small" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!product.is_archived && (
                    <>
                      <DropdownMenuItem
                        onClick={() => {
                          router.push(
                            `/dashboard/${organization.slug}/products/new?fromProductId=${product.id}`,
                          )
                        }}
                      >
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onClick={showArchiveModal}>
                        Archive
                      </DropdownMenuItem>
                    </>
                  )}
                  {product.is_archived && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={showUnarchiveModal}>
                        Unarchive
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      >
        <TabsList className="pb-8">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <ProductOverview
            metrics={metrics}
            todayMetrics={todayMetrics}
            organization={organization}
            product={product}
          />
        </TabsContent>
        <TabsContent value="metrics">
          <ProductMetricsView
            data={metrics}
            interval={allTimeInterval}
            loading={metricsLoading}
            product={product}
          />
        </TabsContent>
        <ConfirmModal
          title="Archive Masterclass"
          description="Archiving a masterclass will not affect its current customers, only prevent new subscribers and purchases."
          onConfirm={handleArchiveProduct}
          isShown={isArchiveModalShown}
          hide={hideArchiveModal}
          destructiveText="Archive"
          destructive
        />
        <ConfirmModal
          title="Unarchive Masterclass"
          description="Unarchiving this masterclass will make it available for new subscribers and purchases again."
          onConfirm={handleUnarchiveProduct}
          isShown={isUnarchiveModalShown}
          hide={hideUnarchiveModal}
          destructiveText="Unarchive"
        />
      </DashboardBody>
    </Tabs>
  )
}
