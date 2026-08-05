'use client'

import { useCustomerPortalSessionRequest } from '@/hooks/queries'
import { setValidationErrors } from '@/utils/api/errors'
import { useRouter } from 'next/navigation'

import { api } from '@/utils/client'
import { schemas } from '@spaire/client'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { PortalAuthScene } from '../_auth/PortalAuthScene'

// Where the authenticate step reads the address back for the "we sent a code
// to <email>" echo and for resending. sessionStorage (not a query param) keeps
// the address out of the URL/history.
export const PORTAL_EMAIL_KEY = 'spaire_portal_signin_email'

interface CustomerSelectionOption {
  id: string
  name: string | null
}

interface CustomerSelectionRequiredResponse {
  error: string
  detail: string
  customers: CustomerSelectionOption[]
}

const ClientPage = ({
  organization,
  email,
}: {
  organization: schemas['CustomerOrganization']
  email?: string
}) => {
  const router = useRouter()
  const form = useForm<{ email: string }>({
    defaultValues: {
      email: email || '',
    },
  })
  const { register, handleSubmit, setError, getValues, formState } = form
  const sessionRequest = useCustomerPortalSessionRequest(api, organization.id)

  const [customers, setCustomers] = useState<CustomerSelectionOption[]>([])
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')

  const onSubmit = useCallback(
    async ({ email }: { email: string }, customerId?: string) => {
      const response = await sessionRequest.mutateAsync({
        email,
        customer_id: customerId,
      })

      // Handle 409 - customer selection required
      if (response.response.status === 409) {
        const data =
          response.error as unknown as CustomerSelectionRequiredResponse
        if (data.customers && data.customers.length > 0) {
          setCustomers(data.customers)
          setShowCustomerPicker(true)
          return
        }
      }

      if (response.error) {
        if (response.error.detail && Array.isArray(response.error.detail)) {
          setValidationErrors(response.error.detail, setError)
        }
        return
      }

      try {
        sessionStorage.setItem(PORTAL_EMAIL_KEY, email)
      } catch {
        /* ignore */
      }
      router.push(`/${organization.slug}/portal/authenticate`)
    },
    [sessionRequest, setError, router, organization],
  )

  const handleCustomerSelect = useCallback(async () => {
    if (!selectedCustomerId) return
    const email = getValues('email')
    await onSubmit({ email }, selectedCustomerId)
  }, [selectedCustomerId, getValues, onSubmit])

  if (showCustomerPicker) {
    return (
      <PortalAuthScene organization={organization}>
        <button
          type="button"
          className="spauth-back"
          onClick={() => {
            setShowCustomerPicker(false)
            setSelectedCustomerId('')
            setCustomers([])
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
          Back
        </button>
        <h1 className="spauth-title">Select an account</h1>
        <p className="spauth-sub">
          Multiple accounts are associated with this email. Choose the one you
          want to access.
        </p>

        <div className="spauth-accounts">
          {customers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className={`spauth-account ${
                selectedCustomerId === customer.id ? 'spauth-selected' : ''
              }`}
              onClick={() => setSelectedCustomerId(customer.id)}
            >
              <span className="spauth-account-dot" />
              {customer.name || 'Unnamed account'}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="spauth-btn"
          onClick={handleCustomerSelect}
          disabled={sessionRequest.isPending || !selectedCustomerId}
        >
          {sessionRequest.isPending ? (
            <span className="spauth-spin" />
          ) : (
            'Continue'
          )}
        </button>
      </PortalAuthScene>
    )
  }

  return (
    <PortalAuthScene organization={organization}>
      <h1 className="spauth-title">Sign in</h1>
      <p className="spauth-sub">
        Enter your email address to access your purchases. A verification code
        will be sent to you.
      </p>

      <form onSubmit={handleSubmit((data) => onSubmit(data))}>
        <div
          className={`spauth-field ${formState.errors.email ? 'spauth-err' : ''}`}
        >
          <label className="spauth-field-label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            className="spauth-field-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="you@example.com"
            {...register('email', { required: 'Enter a valid email address.' })}
          />
          {formState.errors.email && (
            <div className="spauth-field-msg">
              {formState.errors.email.message}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="spauth-btn"
          disabled={sessionRequest.isPending}
        >
          {sessionRequest.isPending ? (
            <span className="spauth-spin" />
          ) : (
            'Send code'
          )}
        </button>
      </form>

      <p className="spauth-footnote">
        By continuing you agree to the{' '}
        <a
          href="https://www.spairehq.com/legal/terms-of-service"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms
        </a>{' '}
        &amp;{' '}
        <a
          href="https://www.spairehq.com/legal/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>
        .
      </p>
    </PortalAuthScene>
  )
}

export default ClientPage
