import { api } from '@/utils/client'
import { unwrap } from '@spaire/client'
import { useQuery } from '@tanstack/react-query'
import { defaultRetry } from './retry'

export const useStorefront = (organizationSlug: string) =>
  useQuery({
    queryKey: ['storefront', { organizationSlug }],
    queryFn: () =>
      unwrap(
        api.GET('/v1/storefronts/{slug}', {
          params: {
            path: { slug: organizationSlug },
          },
        }),
      ),
    retry: defaultRetry,
    // Long-lived editor sessions don't need to refetch the public
    // storefront every time the user alt-tabs back to the page —
    // useUpdateOrganization explicitly invalidates this key on publish,
    // which is the only moment the storefront actually changes.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
