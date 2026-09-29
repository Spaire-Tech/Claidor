import { operations } from '@simeon/client'

export type AuthorizeResponse =
  operations['oauth2:authorize']['responses']['200']['content']['application/json']
