import { getQueryClient } from '@/utils/api/query'
import { api } from '@/utils/client'
import { schemas, unwrap } from '@claidor/client'
import { useMutation, useQuery } from '@tanstack/react-query'
import { defaultRetry } from './retry'

export const usePersonalAccessTokens = () =>
  useQuery({
    queryKey: ['personalAccessTokens'],
    queryFn: () => unwrap(api.GET('/v1/personal_access_tokens/')),
    retry: defaultRetry,
  })

/**
 * Mint a personal access token.
 *
 * The plaintext is in the response and nowhere else — only an HMAC of it is
 * stored — so a caller that discards the result has destroyed the token.
 */
export const useCreatePersonalAccessToken = () =>
  useMutation({
    mutationFn: (body: schemas['PersonalAccessTokenCreate']) =>
      api.POST('/v1/personal_access_tokens/', { body }),
    onSuccess: (result) => {
      if (result.error) {
        return
      }
      getQueryClient().invalidateQueries({ queryKey: ['personalAccessTokens'] })
    },
  })

export const useDeletePersonalAccessToken = () =>
  useMutation({
    mutationFn: (variables: { id: string }) => {
      return api.DELETE('/v1/personal_access_tokens/{id}', {
        params: {
          path: {
            id: variables.id,
          },
        },
      })
    },
    onSuccess: (result, _variables, _ctx) => {
      if (result.error) {
        return
      }
      getQueryClient().invalidateQueries({ queryKey: ['personalAccessTokens'] })
    },
  })

export const useCreateIdentityVerification = () =>
  useMutation({
    mutationFn: () => {
      return api.POST('/v1/users/me/identity-verification')
    },
  })
