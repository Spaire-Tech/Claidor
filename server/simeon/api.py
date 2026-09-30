from fastapi import APIRouter

from simeon.account.endpoints import router as accounts_router
from simeon.audit_log.endpoints import router as audit_log_router
from simeon.auth.endpoints import router as auth_router
from simeon.benefit.endpoints import router as benefits_router
from simeon.benefit.grant.endpoints import router as benefit_grants_router
from simeon.checkout.endpoints import router as checkout_router
from simeon.checkout_link.endpoints import router as checkout_link_router
from simeon.cli.endpoints import router as cli_router
from simeon.client_invoice.endpoints import router as client_invoice_router
from simeon.custom_field.endpoints import router as custom_field_router
from simeon.customer.endpoints import router as customer_router
from simeon.customer_meter.endpoints import router as customer_meter_router
from simeon.customer_notifications.endpoints import (
    router as customer_notifications_router,
)
from simeon.customer_portal.endpoints import router as customer_portal_router
from simeon.customer_seat.endpoints import router as customer_seat_router
from simeon.customer_session.endpoints import router as customer_session_router
from simeon.discount.endpoints import router as discount_router
from simeon.dispute.endpoints import router as dispute_router
from simeon.email_broadcast.endpoints import router as email_broadcast_router
from simeon.email_segment.endpoints import router as email_segment_router
from simeon.email_sequence.endpoints import router as email_sequence_router
from simeon.email_subscriber.endpoints import router as email_subscriber_router
from simeon.email_update.endpoints import router as email_update_router
from simeon.entitlements.endpoints import router as entitlements_router
from simeon.event.endpoints import router as event_router
from simeon.event_type.endpoints import router as event_type_router
from simeon.eventstream.endpoints import router as stream_router
from simeon.file.endpoints import router as files_router
from simeon.form.endpoints import router as form_router
from simeon.integrations.apple.endpoints import router as apple_router
from simeon.integrations.chargeback_stop.endpoints import (
    router as chargeback_stop_router,
)
from simeon.integrations.discord.endpoints import router as discord_router
from simeon.integrations.github.endpoints import router as github_router
from simeon.integrations.github_repository_benefit.endpoints import (
    router as github_repository_benefit_router,
)
from simeon.integrations.google.endpoints import router as google_router
from simeon.integrations.plain.endpoints import router as plain_router
from simeon.integrations.resend.endpoints import router as resend_router
from simeon.integrations.stripe.endpoints import router as stripe_router
from simeon.license_key.endpoints import router as license_key_router
from simeon.login_code.endpoints import router as login_code_router
from simeon.member.endpoints import router as member_router
from simeon.member_session.endpoints import router as member_session_router
from simeon.meter.endpoints import router as meter_router
from simeon.metrics.endpoints import router as metrics_router
from simeon.notifications.endpoints import router as notifications_router
from simeon.oauth2.endpoints.oauth2 import router as oauth2_router
from simeon.order.endpoints import router as order_router
from simeon.organization.endpoints import router as organization_router
from simeon.organization_access_token.endpoints import (
    router as organization_access_token_router,
)
from simeon.organization_custom_domain.endpoints import (
    router as organization_custom_domain_router,
)
from simeon.payment.endpoints import router as payment_router
from simeon.payout.endpoints import router as payout_router
from simeon.personal_access_token.endpoints import router as pat_router
from simeon.platform.endpoints import router as platform_router
from simeon.product.endpoints import router as product_router
from simeon.product_review.endpoints import router as product_review_router
from simeon.refund.endpoints import router as refund_router
from simeon.storefront.endpoints import router as storefront_router
from simeon.subscription.endpoints import router as subscription_router
from simeon.transaction.endpoints import router as transaction_router
from simeon.user.endpoints import router as user_router
from simeon.wallet.endpoints import router as wallet_router
from simeon.webhook.endpoints import router as webhook_router

router = APIRouter(prefix="/v1")

# /users
router.include_router(user_router)
# /integrations/github
router.include_router(github_router)
# /integrations/github_repository_benefit
router.include_router(github_repository_benefit_router)
# /integrations/stripe
router.include_router(stripe_router)
# /integrations/discord
router.include_router(discord_router)
# /integrations/apple
router.include_router(apple_router)
# /login-code
router.include_router(login_code_router)
# /notifications
router.include_router(notifications_router)
# /personal_access_tokens
router.include_router(pat_router)
# /accounts
router.include_router(accounts_router)
# /stream
router.include_router(stream_router)
# /organizations
router.include_router(organization_router)
# /organizations/{id}/custom-domain
router.include_router(organization_custom_domain_router)
# /subscriptions
router.include_router(subscription_router)
# /transactions
router.include_router(transaction_router)
# /auth
router.include_router(auth_router)
# /oauth2
router.include_router(oauth2_router)
# /benefits
router.include_router(benefits_router)
# /benefit-grants
router.include_router(benefit_grants_router)
# /webhooks
router.include_router(webhook_router)
# /products
router.include_router(product_router)
# /orders
router.include_router(order_router)
# /client-invoices
router.include_router(client_invoice_router)
# /refunds
router.include_router(refund_router)
# /disputes
router.include_router(dispute_router)
# /checkouts
router.include_router(checkout_router)
# /cli
router.include_router(cli_router)
# /files
router.include_router(files_router)
# /metrics
router.include_router(metrics_router)
# /entitlements
router.include_router(entitlements_router)
# /platform
router.include_router(platform_router)
# /audit-log
router.include_router(audit_log_router)
# /integrations/google
router.include_router(google_router)


# /license-keys
router.include_router(license_key_router)
# /checkout-links
router.include_router(checkout_link_router)
# /storefronts
router.include_router(storefront_router)
# /product-reviews
router.include_router(product_review_router)
# /custom-fields
router.include_router(custom_field_router)
# /discounts
router.include_router(discount_router)
# /customers
router.include_router(customer_router)
# /members
router.include_router(member_router)
# /customer-portal
router.include_router(customer_portal_router)
# /seats
router.include_router(customer_seat_router)
# /email-subscribers
router.include_router(email_subscriber_router)
# /email-segments
router.include_router(email_segment_router)
# /email-broadcasts
router.include_router(email_broadcast_router)
# /email-sequences
router.include_router(email_sequence_router)
# /forms
router.include_router(form_router)
# /update-email
router.include_router(email_update_router)
# /customer-sessions
router.include_router(customer_session_router)
# /member-sessions
router.include_router(member_session_router)
# /integrations/plain
router.include_router(plain_router)
# /events
router.include_router(event_router)
# /event-types
router.include_router(event_type_router)
# /meters
router.include_router(meter_router)
# /organization-access-tokens
router.include_router(organization_access_token_router)
# /customer-meters
router.include_router(customer_meter_router)
# /payments
router.include_router(payment_router)
# /payouts
router.include_router(payout_router)
# /wallets
router.include_router(wallet_router)
# /integrations/resend
router.include_router(resend_router)
# /integrations/chargeback-stop
router.include_router(chargeback_stop_router)


# /customer-portal/notifications (customer-side bell)
router.include_router(customer_notifications_router)
