'use client'

// EditPricingModal — opens the StepPricingWizard from onboarding step 3
// inside a fullscreen overlay so changing the price of an existing course
// uses the exact same UI (with live checkout preview) the user originally
// configured pricing through. The wizard's "Generate outline" CTA is
// repurposed as "Save changes"; save patches the underlying product and
// closes back to the course Pricing tab.

import { useUpdateProduct } from '@/hooks/queries/products'
import { ProductEditOrCreateForm } from '@/utils/product'
import { isValidationError, schemas } from '@spaire/client'
import { Form } from '@spaire/ui/components/ui/form'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { toast } from '../../Toast/use-toast'
import {
  SpaireOnboardingStyles,
  StepPricingWizard,
  type WizardPaywallState,
} from '../CourseWizard.steps'

// Turn an API error into something a creator can act on — never the raw
// validation payload.
const describeUpdateError = (detail: unknown): string => {
  if (isValidationError(detail)) {
    return detail.map((e) => e.msg).join(' ')
  }
  if (typeof detail === 'string') {
    return detail
  }
  return 'Please try again.'
}

export function EditPricingModal({
  organization,
  product,
  onClose,
}: {
  organization: schemas['Organization']
  product: schemas['Product']
  onClose: () => void
}) {
  const updateProduct = useUpdateProduct(organization)

  // Seed the wizard's form with the product's current pricing so the
  // live checkout preview opens already showing what's actually charged.
  // Spread `...price` so the existing price id rides along — the backend
  // treats that as ExistingProductPrice and keeps the row untouched if
  // it wasn't changed. (The wizard clears the id whenever the amount is
  // edited, so a changed price is sent as a new one replacing the old.)
  const form = useForm<ProductEditOrCreateForm>({
    defaultValues: {
      ...product,
      medias: product.medias.map((m) => m.id),
      full_medias: product.medias,
      prices: product.prices.map((p) => ({ ...p })) as never,
      metadata: Object.entries(product.metadata).map(([key, value]) => ({
        key,
        value,
      })),
    },
  })

  // The paywall slider lives in the course editor's own Pricing tab — we
  // pass a no-op state down so the StepPricingWizard's signature is
  // satisfied without it surfacing the duplicate control.
  const [paywall, setPaywall] = useState<WizardPaywallState>({
    paywallEnabled: false,
    freePreviewLessons: 0,
  })

  const save = async () => {
    const values = form.getValues() as unknown as {
      prices: schemas['ProductUpdate']['prices']
      trial_interval?: schemas['TrialInterval'] | null
      trial_interval_count?: number | null
      full_medias?: schemas['ProductMediaFileRead'][]
    }
    // The billing cycle is immutable after creation (the API rejects any
    // recurring_interval change, and sending `null` for a subscription
    // would try to convert it to one-time), so it's never sent here.
    // Trial settings only exist on subscriptions.
    const isRecurring = product.recurring_interval != null
    try {
      const result = await updateProduct.mutateAsync({
        id: product.id,
        body: {
          prices: values.prices,
          medias: (values.full_medias ?? []).map((m) => m.id),
          ...(isRecurring
            ? {
                trial_interval: values.trial_interval ?? null,
                trial_interval_count: values.trial_interval_count ?? null,
              }
            : {}),
        },
      })
      if (result.error) {
        toast({
          title: 'Failed to update price',
          description: describeUpdateError(
            (result.error as { detail?: unknown }).detail,
          ),
        })
        return
      }
      toast({ title: 'Pricing updated' })
      onClose()
    } catch (err) {
      toast({
        title: 'Failed to update price',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  // Rendered from inside the course editor, which is always dark
  // (`.editor-dark` remaps inputs/surfaces with !important). This overlay is
  // the LIGHT onboarding pricing design, so portal it to <body> — outside the
  // editor-dark scope — or the wizard renders light chrome with dark boxes.
  if (typeof document === 'undefined') return null

  return createPortal(
    <Form {...form}>
      <form
        onSubmit={(e) => e.preventDefault()}
        className="spaire-onboarding"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: '#ffffff',
          overflowY: 'auto',
        }}
      >
        <SpaireOnboardingStyles />
        <div className="spaire-shell">
          <StepPricingWizard
            organization={organization}
            paywall={paywall}
            onPaywallChange={setPaywall}
            onNext={save}
            onBack={onClose}
            onClose={onClose}
            courseTitle={product.name}
            courseDesc={product.description ?? undefined}
            nextLabel={updateProduct.isPending ? 'Saving…' : 'Save changes'}
            backLabel="Cancel"
            hideProgress
            hideAccessSection
            update
          />
        </div>
      </form>
    </Form>,
    document.body,
  )
}
