'use client'

import { useCreatePersonalAccessToken } from '@/hooks/queries'
import Button from '@claidor/ui/components/atoms/Button'
import CopyToClipboardInput from '@claidor/ui/components/atoms/CopyToClipboardInput'
import { useCallback, useState } from 'react'
import { toast } from '../Toast/use-toast'

/**
 * Connecting the app's server to Claidor's model proxy.
 *
 * The app's server is handed one credential, stores it, and has no refresh
 * loop to run. That rules out a desktop session, which is an access token
 * good for one hour (`settings.DESKTOP_ACCESS_TOKEN_TTL`) that the desktop
 * app swaps for a new one behind the person's back. A server given one of
 * those would work for an hour and then answer 401 mid-conversation.
 *
 * So it holds a personal access token carrying `model_proxy`, which is the
 * other credential `get_proxy_caller` accepts. The scope reaches the proxy
 * routes and nothing else on that router.
 *
 * One button rather than a form, for the same reason as the Word one below
 * it: the deployment needs exactly one scope and the page knows which, so
 * a scope picker would only be a question with one right answer.
 *
 * Minting this from a browser session is not a convenience — it is the only
 * way. `personal_access_token.service.create` refuses any caller that is not
 * a web session, so a token can never mint another token.
 */
const ConnectAppSettings = () => {
  const createToken = useCreatePersonalAccessToken()
  const [token, setToken] = useState<string | null>(null)

  const onCreate = useCallback(async () => {
    const { data, error } = await createToken.mutateAsync({
      comment: `App server — created ${new Date().toLocaleDateString()}`,
      scopes: ['model_proxy'],
    })

    if (error) {
      toast({
        title: 'Could not create the token',
        description: error.detail
          ? String(error.detail)
          : 'Something went wrong. Please try again.',
      })
      return
    }

    setToken(data.token)
  }, [createToken])

  return (
    <div className="flex flex-col gap-y-4">
      <p className="text-sm text-gray-500">
        A token for a program of your own that calls the model proxy, billed
        to this account&apos;s allowance. Simeon on your Mac never needs one:
        it signs in with your account. Keep the token where the program reads
        it, and nowhere else.
      </p>

      {token ? (
        <div className="flex flex-col gap-y-2">
          <CopyToClipboardInput value={token} />
          <p className="text-sm text-gray-500">
            Copy it now. This is the only time it can be shown — Simeon stores
            a one-way hash of it and cannot recover the token itself. If you
            lose it, revoke it below and create another.
          </p>
        </div>
      ) : (
        <Button
          onClick={onCreate}
          loading={createToken.isPending}
          disabled={createToken.isPending}
          className="self-start"
        >
          Create a token for the app
        </Button>
      )}
    </div>
  )
}

export default ConnectAppSettings
