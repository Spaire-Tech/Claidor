'use client'

import {
  useDeletePersonalAccessToken,
  usePersonalAccessTokens,
} from '@/hooks/queries'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import FormattedDateTime from '@spaire/ui/components/atoms/FormattedDateTime'
import ShadowListGroup from '@spaire/ui/components/atoms/ShadowListGroup'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@spaire/ui/components/ui/alert-dialog'
import { useCallback } from 'react'
import { toast } from '../Toast/use-toast'

const AccessToken = (props: schemas['PersonalAccessToken']) => {
  const deleteToken = useDeletePersonalAccessToken()

  const onDelete = useCallback(async () => {
    deleteToken.mutateAsync({ id: props.id }).then(({ error }) => {
      if (error) {
        toast({
          title: 'Access Token Deletion Failed',
          description: `Error deleting access token: ${error.detail}`,
        })
        return
      }
      toast({
        title: 'Access Token Deleted',
        description: `Access Token ${props.comment} was deleted successfully`,
      })
    })
  }, [deleteToken, props])

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-row">
          <div className="gap-y flex flex-col">
            <h3 className="text-md">{props.comment}</h3>
            <p className=" text-sm text-gray-500">
              {props.expires_at ? (
                <>
                  Expires on{' '}
                  <FormattedDateTime
                    datetime={props.expires_at}
                    dateStyle="long"
                  />
                </>
              ) : (
                <span className="text-red-500">
                  Never expires
                </span>
              )}{' '}
              —{' '}
              {props.last_used_at ? (
                <>
                  Last used on{' '}
                  <FormattedDateTime
                    datetime={props.last_used_at}
                    dateStyle="long"
                  />
                </>
              ) : (
                'Never used'
              )}
            </p>
          </div>
        </div>{' '}
        <div className=" flex flex-row items-center gap-x-4 space-x-4 text-gray-500">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Revoke</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your access token.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90 cursor-pointer text-white"
                  asChild
                >
                  <span onClick={onDelete}>Delete Personal Access Token</span>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}

const AccessTokensSettings = () => {
  const tokens = usePersonalAccessTokens()
  return (
    <div className="flex w-full flex-col gap-4">
      <ShadowListGroup>
        {tokens.data?.items && tokens.data.items.length > 0 ? (
          tokens.data?.items.map((token) => (
            <ShadowListGroup.Item key={token.id}>
              <AccessToken {...token} />
            </ShadowListGroup.Item>
          ))
        ) : (
          <ShadowListGroup.Item>
            <p className=" text-sm text-gray-500">
              You don&apos;t have any active Personal Access Tokens.
            </p>
          </ShadowListGroup.Item>
        )}
      </ShadowListGroup>
    </div>
  )
}

export default AccessTokensSettings
