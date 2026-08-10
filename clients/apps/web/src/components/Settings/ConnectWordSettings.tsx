'use client'

import { useCreatePersonalAccessToken } from '@/hooks/queries'
import Button from '@claidor/ui/components/atoms/Button'
import CopyToClipboardInput from '@claidor/ui/components/atoms/CopyToClipboardInput'
import { useCallback, useState } from 'react'
import { toast } from '../Toast/use-toast'

/**
 * Connecting the Word add-in.
 *
 * The pane runs in an iframe on its own origin, so it cannot use the
 * session cookie this page is holding — Safari and Edge block third-party
 * cookies outright, and a SameSite=Lax cookie is not sent from a frame
 * regardless. It needs a bearer token, and this is where one comes from
 * until the sign-in dialog exists.
 *
 * One button rather than a form. The alternative is a scope picker, and
 * asking a lawyer to choose between `redline:read` and `redline:write` is
 * asking them a question they have no way to answer. The add-in needs
 * exactly one scope; the page knows which.
 *
 * The token is shown once and then it is gone: only an HMAC of it is
 * stored, so there is no route, no query and no support process that can
 * recover it. That is a property worth stating on screen rather than
 * discovering.
 */
const ConnectWordSettings = () => {
  const createToken = useCreatePersonalAccessToken()
  const [token, setToken] = useState<string | null>(null)

  const onCreate = useCallback(async () => {
    const { data, error } = await createToken.mutateAsync({
      comment: `Word add-in — created ${new Date().toLocaleDateString()}`,
      scopes: ['redline:read'],
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
        The Word add-in checks documents against the Claidor engine, and
        needs a token to reach it. Create one here, then paste it into the
        Check panel in Word.
      </p>

      {token ? (
        <div className="flex flex-col gap-y-2">
          <CopyToClipboardInput value={token} />
          <p className="text-sm text-gray-500">
            Copy it now. This is the only time it can be shown — Claidor
            stores a one-way hash of it and cannot recover the token itself.
            If you lose it, revoke it below and create another.
          </p>
        </div>
      ) : (
        <Button
          onClick={onCreate}
          loading={createToken.isPending}
          disabled={createToken.isPending}
          className="self-start"
        >
          Create a token for Word
        </Button>
      )}
    </div>
  )
}

export default ConnectWordSettings
