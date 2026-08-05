import { useUpdateOrganization } from '@/hooks/queries'
import { useAutoSave } from '@/hooks/useAutoSave'
import { setValidationErrors } from '@/utils/api/errors'
import { isValidationError, schemas } from '@spaire/client'
import Switch from '@spaire/ui/components/atoms/Switch'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from '../Toast/use-toast'
import { SettingsGroup, SettingsGroupItem } from './SettingsGroup'

interface OrganizationCustomerPortalSettingsProps {
  organization: schemas['Organization']
}

const OrganizationCustomerPortalSettings: React.FC<
  OrganizationCustomerPortalSettingsProps
> = ({ organization }) => {
  const form = useForm<schemas['OrganizationCustomerPortalSettings']>({
    defaultValues: organization.customer_portal_settings,
  })
  const { control, setError, reset } = form

  const updateOrganization = useUpdateOrganization()
  const onSave = async (
    customer_portal_settings: schemas['OrganizationCustomerPortalSettings'],
  ) => {
    const { data, error } = await updateOrganization.mutateAsync({
      id: organization.id,
      body: {
        customer_portal_settings,
      },
    })

    if (error) {
      if (isValidationError(error.detail)) {
        setValidationErrors(error.detail, setError)
      } else {
        setError('root', { message: error.detail })
      }

      toast({
        title: 'Customer Portal Settings Update Failed',
        description: `Error updating customer portal settings: ${error.detail}`,
      })

      return
    }

    reset(data.customer_portal_settings)
  }

  useAutoSave({
    form,
    onSave,
    delay: 200,
  })

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
        }}
      >
        <SettingsGroup>
          {/* Course-only reposition: the "Show metered usage" and "subscription
              seat management" toggles are removed; only plan-change control
              remains, surfaced under the Subscriptions settings section. The
              underlying customer_portal_settings.usage.show and
              subscription.update_seats values are left untouched server-side. */}
          <SettingsGroupItem
            title="Enable subscription plan changes"
            description="Allow customers to change their subscription plan from the portal."
          >
            <FormField
              control={control}
              name="subscription.update_plan"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SettingsGroupItem>
        </SettingsGroup>
      </form>
    </Form>
  )
}

export default OrganizationCustomerPortalSettings
