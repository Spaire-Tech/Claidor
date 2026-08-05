import json
import sys
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, Discriminator, TypeAdapter

from polar.notifications.notification import (
    MaintainerAccountCreditsGrantedNotificationPayload,
    MaintainerCreateAccountNotificationPayload,
    MaintainerNewPaidSubscriptionNotificationPayload,
    MaintainerNewProductSaleNotificationPayload,
)
from polar.order.schemas import OrderBase, OrderItemSchema
from polar.organization.schemas import Organization
from polar.product.schemas import BenefitList, ProductBase
from polar.subscription.schemas import SubscriptionBase


class EmailTemplate(StrEnum):
    marketing_email = "marketing_email"
    client_invoice = "client_invoice"
    login_code = "login_code"
    customer_session_code = "customer_session_code"
    email_update = "email_update"
    oauth2_leaked_client = "oauth2_leaked_client"
    oauth2_leaked_token = "oauth2_leaked_token"
    order_confirmation = "order_confirmation"
    organization_access_token_leaked = "organization_access_token_leaked"
    organization_invite = "organization_invite"
    organization_account_unlink = "organization_account_unlink"
    organization_under_review = "organization_under_review"
    organization_reviewed = "organization_reviewed"
    personal_access_token_leaked = "personal_access_token_leaked"
    seat_invitation = "seat_invitation"
    subscription_cancellation = "subscription_cancellation"
    subscription_confirmation = "subscription_confirmation"
    subscription_cycled = "subscription_cycled"
    subscription_past_due = "subscription_past_due"
    subscription_revoked = "subscription_revoked"
    subscription_uncanceled = "subscription_uncanceled"
    subscription_updated = "subscription_updated"
    user_welcome = "user_welcome"
    platform_receipt = "platform_receipt"
    platform_subscription_notice = "platform_subscription_notice"
    webhook_endpoint_disabled = "webhook_endpoint_disabled"
    notification_new_sale = "notification_new_sale"
    notification_new_subscription = "notification_new_subscription"
    notification_create_account = "notification_create_account"
    notification_credits_granted = "notification_credits_granted"
    community_event_published = "community_event_published"
    community_event_rsvp_confirmed = "community_event_rsvp_confirmed"
    community_event_starting_soon_24h = "community_event_starting_soon_24h"
    community_event_live = "community_event_live"
    community_event_announcement = "community_event_announcement"


class MarketingEmailProps(BaseModel):
    organization_name: str
    organization_logo_url: str | None = None
    organization_website: str | None = None
    html_content: str
    unsubscribe_url: str
    preview_text: str | None = None


class MarketingEmail(BaseModel):
    template: Literal[EmailTemplate.marketing_email] = EmailTemplate.marketing_email
    props: MarketingEmailProps


class SubscriptionEmail(SubscriptionBase): ...


class ProductEmail(ProductBase):
    benefits: BenefitList


class OrderEmail(OrderBase):
    description: str
    items: list[OrderItemSchema]


class EmailProps(BaseModel):
    email: str


class ClientInvoiceEmailLineItem(BaseModel):
    description: str
    quantity: int
    amount: int


class ClientInvoiceEmailProps(EmailProps):
    organization_name: str
    organization_avatar_url: str | None = None
    customer_name: str
    invoice_id: str
    due_date: str | None
    currency: str
    line_items: list[ClientInvoiceEmailLineItem]
    subtotal_amount: int
    discount_amount: int
    discount_label: str | None
    tax_amount: int
    total_amount: int
    checkout_link: str | None
    memo: str | None


class ClientInvoiceEmail(BaseModel):
    template: Literal[EmailTemplate.client_invoice] = EmailTemplate.client_invoice
    props: ClientInvoiceEmailProps


class LoginCodeProps(EmailProps):
    code: str
    code_lifetime_minutes: int


class LoginCodeEmail(BaseModel):
    template: Literal[EmailTemplate.login_code] = EmailTemplate.login_code
    props: LoginCodeProps


class CustomerSessionCodeProps(EmailProps):
    organization: Organization
    code: str
    code_lifetime_minutes: int
    url: str


class CustomerSessionCodeEmail(BaseModel):
    template: Literal[EmailTemplate.customer_session_code] = (
        EmailTemplate.customer_session_code
    )
    props: CustomerSessionCodeProps


class EmailUpdateProps(EmailProps):
    token_lifetime_minutes: int
    url: str


class EmailUpdateEmail(BaseModel):
    template: Literal[EmailTemplate.email_update] = EmailTemplate.email_update
    props: EmailUpdateProps


class OAuth2LeakedClientProps(EmailProps):
    token_type: str
    client_name: str
    notifier: str
    url: str


class OAuth2LeakedClientEmail(BaseModel):
    template: Literal[EmailTemplate.oauth2_leaked_client] = (
        EmailTemplate.oauth2_leaked_client
    )
    props: OAuth2LeakedClientProps


class OAuth2LeakedTokenProps(EmailProps):
    client_name: str
    notifier: str
    url: str


class OAuth2LeakedTokenEmail(BaseModel):
    template: Literal[EmailTemplate.oauth2_leaked_token] = (
        EmailTemplate.oauth2_leaked_token
    )
    props: OAuth2LeakedTokenProps


class OrderConfirmationProps(EmailProps):
    organization: Organization
    product: ProductEmail | None
    order: OrderEmail
    url: str


class OrderConfirmationEmail(BaseModel):
    template: Literal[EmailTemplate.order_confirmation] = (
        EmailTemplate.order_confirmation
    )
    props: OrderConfirmationProps


class OrganizationAccessTokenLeakedProps(EmailProps):
    organization_access_token: str
    notifier: str
    url: str


class OrganizationAccessTokenLeakedEmail(BaseModel):
    template: Literal[EmailTemplate.organization_access_token_leaked] = (
        EmailTemplate.organization_access_token_leaked
    )
    props: OrganizationAccessTokenLeakedProps


class OrganizationInviteProps(EmailProps):
    organization_name: str
    inviter_email: str
    invite_url: str


class OrganizationInviteEmail(BaseModel):
    template: Literal[EmailTemplate.organization_invite] = (
        EmailTemplate.organization_invite
    )
    props: OrganizationInviteProps


class OrganizationUnderReviewProps(EmailProps):
    organization: Organization


class OrganizationUnderReviewEmail(BaseModel):
    template: Literal[EmailTemplate.organization_under_review] = (
        EmailTemplate.organization_under_review
    )
    props: OrganizationUnderReviewProps


class OrganizationReviewedProps(EmailProps):
    organization: Organization


class OrganizationReviewedEmail(BaseModel):
    template: Literal[EmailTemplate.organization_reviewed] = (
        EmailTemplate.organization_reviewed
    )
    props: OrganizationReviewedProps


class PersonalAccessTokenLeakedProps(EmailProps):
    personal_access_token: str
    notifier: str
    url: str


class PersonalAccessTokenLeakedEmail(BaseModel):
    template: Literal[EmailTemplate.personal_access_token_leaked] = (
        EmailTemplate.personal_access_token_leaked
    )
    props: PersonalAccessTokenLeakedProps


class SeatInvitationProps(EmailProps):
    organization: Organization
    product_name: str
    billing_manager_email: str
    claim_url: str


class SeatInvitationEmail(BaseModel):
    template: Literal[EmailTemplate.seat_invitation] = EmailTemplate.seat_invitation
    props: SeatInvitationProps


class SubscriptionPropsBase(EmailProps):
    organization: Organization
    product: ProductEmail
    subscription: SubscriptionEmail
    url: str


class SubscriptionCancellationProps(SubscriptionPropsBase): ...


class SubscriptionCancellationEmail(BaseModel):
    template: Literal[EmailTemplate.subscription_cancellation] = (
        EmailTemplate.subscription_cancellation
    )
    props: SubscriptionCancellationProps


class SubscriptionConfirmationProps(SubscriptionPropsBase):
    order: OrderEmail


class SubscriptionConfirmationEmail(BaseModel):
    template: Literal[EmailTemplate.subscription_confirmation] = (
        EmailTemplate.subscription_confirmation
    )
    props: SubscriptionConfirmationProps


class SubscriptionCycledProps(SubscriptionPropsBase):
    order: OrderEmail


class SubscriptionCycledEmail(BaseModel):
    template: Literal[EmailTemplate.subscription_cycled] = (
        EmailTemplate.subscription_cycled
    )
    props: SubscriptionCycledProps


class SubscriptionPastDueProps(SubscriptionPropsBase):
    payment_url: str | None = None


class SubscriptionPastDueEmail(BaseModel):
    template: Literal[EmailTemplate.subscription_past_due] = (
        EmailTemplate.subscription_past_due
    )
    props: SubscriptionPastDueProps


class SubscriptionRevokedProps(SubscriptionPropsBase): ...


class SubscriptionRevokedEmail(BaseModel):
    template: Literal[EmailTemplate.subscription_revoked] = (
        EmailTemplate.subscription_revoked
    )
    props: SubscriptionRevokedProps


class SubscriptionUncanceledProps(SubscriptionPropsBase): ...


class SubscriptionUncanceledEmail(BaseModel):
    template: Literal[EmailTemplate.subscription_uncanceled] = (
        EmailTemplate.subscription_uncanceled
    )
    props: SubscriptionUncanceledProps


class SubscriptionUpdatedProps(SubscriptionPropsBase):
    order: OrderEmail | None


class SubscriptionUpdatedEmail(BaseModel):
    template: Literal[EmailTemplate.subscription_updated] = (
        EmailTemplate.subscription_updated
    )
    props: SubscriptionUpdatedProps


class UserWelcomeProps(EmailProps): ...


class UserWelcomeEmail(BaseModel):
    template: Literal[EmailTemplate.user_welcome] = EmailTemplate.user_welcome
    props: UserWelcomeProps


# ----------------------------------------------------------------------
# Spaire platform billing (self-billing: Spaire bills the creator)
#
# Transactional, Spaire-branded receipt for the platform's OWN billing of a
# creator org. Distinct from the creator-commerce templates above — those
# render the *selling* org's header + "Merchant of Record … by Spaire" and
# are for a creator billing THEIR customers. On a Spaire plan the seller IS
# the platform org, so those templates render "Spaire / Spaire" nonsense.
# Uses the Spaire logo (WrapperPolar) and a transactional footer (no
# unsubscribe). The trial-start welcome reuses the founder `user_welcome`.
# ----------------------------------------------------------------------


class PlatformReceiptProps(EmailProps):
    plan_name: str
    order: OrderEmail
    url: str
    # False when invoice generation was skipped (missing billing details) or
    # failed — the template must not claim "your invoice is attached".
    invoice_attached: bool = True


class PlatformReceiptEmail(BaseModel):
    template: Literal[EmailTemplate.platform_receipt] = EmailTemplate.platform_receipt
    props: PlatformReceiptProps


class PlatformSubscriptionNoticeProps(EmailProps):
    """Spaire-branded lifecycle notice for the platform's own billing of a
    creator (payment failed, plan ended, cancellation scheduled, …). One
    generic branded shell; the Python side composes title/body per event so
    a new lifecycle message never needs a new template."""

    title: str
    body_lines: list[str]
    url: str
    cta_label: str


class PlatformSubscriptionNoticeEmail(BaseModel):
    template: Literal[EmailTemplate.platform_subscription_notice] = (
        EmailTemplate.platform_subscription_notice
    )
    props: PlatformSubscriptionNoticeProps


class WebhookEndpointDisabledProps(EmailProps):
    organization: Organization
    webhook_endpoint_url: str
    dashboard_url: str


class WebhookEndpointDisabledEmail(BaseModel):
    template: Literal[EmailTemplate.webhook_endpoint_disabled] = (
        EmailTemplate.webhook_endpoint_disabled
    )
    props: WebhookEndpointDisabledProps


class NotificationNewSaleEmail(BaseModel):
    template: Literal[EmailTemplate.notification_new_sale] = (
        EmailTemplate.notification_new_sale
    )
    props: MaintainerNewProductSaleNotificationPayload


class NotificationNewSubscriptionEmail(BaseModel):
    template: Literal[EmailTemplate.notification_new_subscription] = (
        EmailTemplate.notification_new_subscription
    )
    props: MaintainerNewPaidSubscriptionNotificationPayload


class NotificationCreateAccountEmail(BaseModel):
    template: Literal[EmailTemplate.notification_create_account] = (
        EmailTemplate.notification_create_account
    )
    props: MaintainerCreateAccountNotificationPayload


class NotificationCreditsGrantedEmail(BaseModel):
    template: Literal[EmailTemplate.notification_credits_granted] = (
        EmailTemplate.notification_credits_granted
    )
    props: MaintainerAccountCreditsGrantedNotificationPayload


class OrganizationAccountUnlinkProps(EmailProps):
    organization_kept_name: str
    organizations_unlinked: list[str]


class OrganizationAccountUnlinkEmail(BaseModel):
    template: Literal[EmailTemplate.organization_account_unlink] = (
        EmailTemplate.organization_account_unlink
    )
    props: OrganizationAccountUnlinkProps


# ----------------------------------------------------------------------
# Community events
# ----------------------------------------------------------------------


class CommunityEmailOrgInfo(BaseModel):
    """Subset of Organization the event emails actually render.

    Stays flat + small so the customer_notifications payload (which
    persists with the bell row) doesn't carry the full ~30-field
    Organization schema. The header/footer components on the email
    side only consume name/slug/avatar/website."""

    id: str
    name: str
    slug: str
    avatar_url: str | None = None
    website: str | None = None


class CommunityEventCardData(BaseModel):
    """Presentational data the EventCard React Email component renders.
    Kept flat (no nested Event model) so the template can be invoked
    from any context — including bell rows whose stored payload doesn't
    have access to a live SQLAlchemy session."""

    title: str
    type: str
    start_at: str  # ISO 8601 UTC
    timezone: str = "UTC"
    duration_minutes: int
    host_name: str
    host_avatar_url: str | None = None
    cover_url: str | None = None
    cover_object_position: str | None = None
    location: str | None = None
    meeting_url: str | None = None


class _CommunityEventEmailBaseProps(EmailProps):
    organization: CommunityEmailOrgInfo
    course_name: str
    event_url: str
    event: CommunityEventCardData


class CommunityEventPublishedProps(_CommunityEventEmailBaseProps):
    host_name: str


class CommunityEventPublishedEmail(BaseModel):
    template: Literal[EmailTemplate.community_event_published] = (
        EmailTemplate.community_event_published
    )
    props: CommunityEventPublishedProps


class CommunityEventRsvpConfirmedProps(_CommunityEventEmailBaseProps): ...


class CommunityEventRsvpConfirmedEmail(BaseModel):
    template: Literal[EmailTemplate.community_event_rsvp_confirmed] = (
        EmailTemplate.community_event_rsvp_confirmed
    )
    props: CommunityEventRsvpConfirmedProps


class CommunityEventStartingSoon24hProps(_CommunityEventEmailBaseProps): ...


class CommunityEventStartingSoon24hEmail(BaseModel):
    template: Literal[EmailTemplate.community_event_starting_soon_24h] = (
        EmailTemplate.community_event_starting_soon_24h
    )
    props: CommunityEventStartingSoon24hProps


class CommunityEventLiveProps(_CommunityEventEmailBaseProps): ...


class CommunityEventLiveEmail(BaseModel):
    template: Literal[EmailTemplate.community_event_live] = (
        EmailTemplate.community_event_live
    )
    props: CommunityEventLiveProps


class CommunityEventAnnouncementProps(_CommunityEventEmailBaseProps):
    """Host-composed announcement on top of the standard event card.

    Subject + body come straight from the composer modal; everything
    else (org, event, course_name, event_url) is identical to the
    auto-fired event emails so the recipient gets a consistent look."""

    subject: str
    body: str
    host_name: str


class CommunityEventAnnouncementEmail(BaseModel):
    template: Literal[EmailTemplate.community_event_announcement] = (
        EmailTemplate.community_event_announcement
    )
    props: CommunityEventAnnouncementProps


Email = Annotated[
    MarketingEmail
    | ClientInvoiceEmail
    | LoginCodeEmail
    | CustomerSessionCodeEmail
    | EmailUpdateEmail
    | OAuth2LeakedClientEmail
    | OAuth2LeakedTokenEmail
    | OrderConfirmationEmail
    | OrganizationAccessTokenLeakedEmail
    | OrganizationInviteEmail
    | OrganizationAccountUnlinkEmail
    | OrganizationUnderReviewEmail
    | OrganizationReviewedEmail
    | PersonalAccessTokenLeakedEmail
    | SeatInvitationEmail
    | SubscriptionCancellationEmail
    | SubscriptionConfirmationEmail
    | SubscriptionCycledEmail
    | SubscriptionPastDueEmail
    | SubscriptionRevokedEmail
    | SubscriptionUncanceledEmail
    | SubscriptionUpdatedEmail
    | UserWelcomeEmail
    | PlatformReceiptEmail
    | PlatformSubscriptionNoticeEmail
    | WebhookEndpointDisabledEmail
    | NotificationNewSaleEmail
    | NotificationNewSubscriptionEmail
    | NotificationCreateAccountEmail
    | NotificationCreditsGrantedEmail
    | CommunityEventPublishedEmail
    | CommunityEventRsvpConfirmedEmail
    | CommunityEventStartingSoon24hEmail
    | CommunityEventLiveEmail
    | CommunityEventAnnouncementEmail,
    Discriminator("template"),
]

EmailAdapter: TypeAdapter[Email] = TypeAdapter(Email)


if __name__ == "__main__":
    openapi_schema = {
        "openapi": "3.1.0",
        "paths": {},
        "components": {
            "schemas": EmailAdapter.json_schema(
                mode="serialization", ref_template="#/components/schemas/{model}"
            )["$defs"]
        },
    }
    sys.stdout.write(json.dumps(openapi_schema, indent=2))
