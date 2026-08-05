import { ClientInvoice } from './client_invoice'
import { CommunityEventAnnouncement } from './community_event_announcement'
import { CommunityEventLive } from './community_event_live'
import { CommunityEventPublished } from './community_event_published'
import { CommunityEventRsvpConfirmed } from './community_event_rsvp_confirmed'
import { CommunityEventStartingSoon24h } from './community_event_starting_soon_24h'
import { CustomerSessionCode } from './customer_session_code'
import { EmailUpdate } from './email_update'
import { LoginCode } from './login_code'
import { MarketingEmail } from './marketing_email'
import { NotificationCreateAccount } from './notification_create_account'
import { NotificationCreditsGranted } from './notification_credits_granted'
import { NotificationNewSale } from './notification_new_sale'
import { NotificationNewSubscription } from './notification_new_subscription'
import { NotificationPerksUnlocked } from './notification_perks_unlocked'
import { OAuth2LeakedClient } from './oauth2_leaked_client'
import { OAuth2LeakedToken } from './oauth2_leaked_token'
import { OrderConfirmation } from './order_confirmation'
import { OrganizationAccessTokenLeaked } from './organization_access_token_leaked'
import { OrganizationAccountUnlink } from './organization_account_unlink'
import { OrganizationInvite } from './organization_invite'
import OrganizationReviewed from './organization_reviewed'
import { OrganizationUnderReview } from './organization_under_review'
import { PersonalAccessTokenLeaked } from './personal_access_token_leaked'
import { PlatformReceipt } from './platform_receipt'
import { PlatformSubscriptionNotice } from './platform_subscription_notice'
import { SeatInvitation } from './seat_invitation'
import { SubscriptionCancellation } from './subscription_cancellation'
import { SubscriptionConfirmation } from './subscription_confirmation'
import { SubscriptionCycled } from './subscription_cycled'
import { SubscriptionPastDue } from './subscription_past_due'
import { SubscriptionRevoked } from './subscription_revoked'
import { SubscriptionUncanceled } from './subscription_uncanceled'
import { SubscriptionUpdated } from './subscription_updated'
import { UserWelcome } from './user_welcome'
import { WebhookEndpointDisabled } from './webhook_endpoint_disabled'

const TEMPLATES: Record<string, React.FC<any>> = {
  marketing_email: MarketingEmail,
  client_invoice: ClientInvoice,
  login_code: LoginCode,
  customer_session_code: CustomerSessionCode,
  email_update: EmailUpdate,
  oauth2_leaked_client: OAuth2LeakedClient,
  oauth2_leaked_token: OAuth2LeakedToken,
  order_confirmation: OrderConfirmation,
  organization_access_token_leaked: OrganizationAccessTokenLeaked,
  organization_account_unlink: OrganizationAccountUnlink,
  organization_invite: OrganizationInvite,
  organization_under_review: OrganizationUnderReview,
  organization_reviewed: OrganizationReviewed,
  personal_access_token_leaked: PersonalAccessTokenLeaked,
  seat_invitation: SeatInvitation,
  platform_receipt: PlatformReceipt,
  platform_subscription_notice: PlatformSubscriptionNotice,
  subscription_cancellation: SubscriptionCancellation,
  subscription_confirmation: SubscriptionConfirmation,
  subscription_cycled: SubscriptionCycled,
  subscription_past_due: SubscriptionPastDue,
  subscription_revoked: SubscriptionRevoked,
  subscription_uncanceled: SubscriptionUncanceled,
  subscription_updated: SubscriptionUpdated,
  user_welcome: UserWelcome,
  webhook_endpoint_disabled: WebhookEndpointDisabled,
  notification_new_sale: NotificationNewSale,
  notification_new_subscription: NotificationNewSubscription,
  notification_create_account: NotificationCreateAccount,
  notification_credits_granted: NotificationCreditsGranted,
  notification_perks_unlocked: NotificationPerksUnlocked,
  community_event_published: CommunityEventPublished,
  community_event_rsvp_confirmed: CommunityEventRsvpConfirmed,
  community_event_starting_soon_24h: CommunityEventStartingSoon24h,
  community_event_live: CommunityEventLive,
  community_event_announcement: CommunityEventAnnouncement,
}

export default TEMPLATES
