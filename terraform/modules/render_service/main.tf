# Polar Render service setup
#
# Sets up a service, and the specified workers.
# Includes the environment groups

locals {
  environment = var.backend_config.environment == null ? var.environment : var.backend_config.environment
}

resource "render_env_group" "google" {
  environment_id = var.render_environment_id
  name           = "google-${var.environment}"
  env_vars = {
    SPAIRE_GOOGLE_CLIENT_ID     = { value = var.google_secrets.client_id }
    SPAIRE_GOOGLE_CLIENT_SECRET = { value = var.google_secrets.client_secret }
  }
}

resource "render_env_group" "openai" {
  environment_id = var.render_environment_id
  name           = "openai-${var.environment}"
  env_vars = {
    SPAIRE_OPENAI_API_KEY = { value = var.openai_secrets.api_key }
  }
}

resource "render_env_group" "backend" {
  environment_id = var.render_environment_id
  name           = "backend-${var.environment}"
  env_vars = merge(
    {
      SPAIRE_USER_SESSION_COOKIE_DOMAIN = { value = var.backend_config.user_session_cookie_domain }
      SPAIRE_BASE_URL                   = { value = var.backend_config.base_url }
      SPAIRE_DEBUG                      = { value = var.backend_config.debug }
      SPAIRE_EMAIL_SENDER               = { value = var.backend_config.email_sender }
      SPAIRE_EMAIL_FROM_NAME            = { value = var.backend_config.email_from_name }
      SPAIRE_EMAIL_FROM_DOMAIN          = { value = var.backend_config.email_from_domain }
      SPAIRE_ENV                        = { value = local.environment }
      SPAIRE_FRONTEND_BASE_URL          = { value = var.backend_config.frontend_base_url }
      SPAIRE_CHECKOUT_BASE_URL          = { value = var.backend_config.checkout_base_url }
      SPAIRE_JWKS                       = { value = var.backend_config.jwks_path }
      SPAIRE_LOG_LEVEL                  = { value = var.backend_config.log_level }
      SPAIRE_TESTING                    = { value = var.backend_config.testing }
      SPAIRE_AUTH_COOKIE_DOMAIN         = { value = var.backend_config.auth_cookie_domain }
      SPAIRE_INVOICES_ADDITIONAL_INFO   = { value = var.backend_config.invoices_additional_info }
      SPAIRE_STRIPE_PUBLISHABLE_KEY     = { value = var.backend_secrets.stripe_publishable_key }
      SPAIRE_CURRENT_JWK_KID            = { value = var.backend_secrets.current_jwk_kid }
      SPAIRE_DISCORD_BOT_TOKEN          = { value = var.backend_secrets.discord_bot_token }
      SPAIRE_DISCORD_CLIENT_ID          = { value = var.backend_secrets.discord_client_id }
      SPAIRE_DISCORD_CLIENT_SECRET      = { value = var.backend_secrets.discord_client_secret }
      SPAIRE_DISCORD_PROXY_URL          = { value = var.backend_secrets.discord_proxy_url }
      SPAIRE_RESEND_API_KEY             = { value = var.backend_secrets.resend_api_key }
      SPAIRE_LOGO_DEV_PUBLISHABLE_KEY   = { value = var.backend_secrets.logo_dev_publishable_key }
      SPAIRE_SECRET                     = { value = var.backend_secrets.secret }
      SPAIRE_SENTRY_DSN                 = { value = var.backend_secrets.sentry_dsn }
      SPAIRE_DEFAULT_TAX_PROCESSOR      = { value = var.backend_config.default_tax_processor }
      SPAIRE_NUMERAL_API_KEY            = { value = var.backend_secrets.numeral_api_key }
    },
    var.backend_config.user_session_cookie_key != "" ? {
      SPAIRE_USER_SESSION_COOKIE_KEY = { value = var.backend_config.user_session_cookie_key }
    } : {},
    var.backend_config.auth_cookie_key != "" ? {
      SPAIRE_AUTH_COOKIE_KEY = { value = var.backend_config.auth_cookie_key }
    } : {},
  )

  secret_files = {
    "jwks.json" = {
      content = var.backend_secrets.jwks
    }
  }
}

resource "render_env_group" "backend_production" {
  count          = var.environment == "production" ? 1 : 0
  environment_id = var.render_environment_id
  name           = "backend-production-only"
  env_vars = {
    SPAIRE_BACKOFFICE_HOST                = { value = var.backend_config.backoffice_host }
    SPAIRE_CHECKOUT_LINK_HOST             = { value = var.backend_config.checkout_link_host }
    SPAIRE_DISCORD_WEBHOOK_URL            = { value = var.backend_secrets.discord_webhook_url }
    SPAIRE_LOOPS_API_KEY                  = { value = var.backend_secrets.loops_api_key }
    SPAIRE_POSTHOG_PROJECT_API_KEY        = { value = var.backend_secrets.posthog_project_api_key }
    SPAIRE_PLAIN_REQUEST_SIGNING_SECRET   = { value = var.backend_secrets.plain_request_signing_secret }
    SPAIRE_PLAIN_TOKEN                    = { value = var.backend_secrets.plain_token }
    SPAIRE_PLAIN_CHAT_SECRET              = { value = var.backend_secrets.plain_chat_secret }
    SPAIRE_APP_REVIEW_EMAIL               = { value = var.backend_secrets.app_review_email }
    SPAIRE_APP_REVIEW_OTP_CODE            = { value = var.backend_secrets.app_review_otp_code }
    SPAIRE_CHARGEBACK_STOP_WEBHOOK_SECRET = { value = var.backend_secrets.chargeback_stop_webhook_secret }
  }
}

resource "render_env_group" "aws_s3" {
  environment_id = var.render_environment_id
  name           = "aws-s3-${var.environment}"
  env_vars = {
    SPAIRE_AWS_REGION                       = { value = var.aws_s3_config.region }
    SPAIRE_AWS_SIGNATURE_VERSION            = { value = var.aws_s3_config.signature_version }
    SPAIRE_S3_FILES_BUCKET_NAME             = { value = "polar-${var.environment}-files" }
    SPAIRE_S3_FILES_PRESIGN_TTL             = { value = var.aws_s3_config.files_presign_ttl }
    SPAIRE_S3_FILES_PUBLIC_BUCKET_NAME      = { value = var.aws_s3_config.files_public_bucket_name }
    SPAIRE_S3_CUSTOMER_INVOICES_BUCKET_NAME = { value = var.aws_s3_config.customer_invoices_bucket_name }
    SPAIRE_S3_PAYOUT_INVOICES_BUCKET_NAME   = { value = var.aws_s3_config.payout_invoices_bucket_name }
    SPAIRE_AWS_ACCESS_KEY_ID                = { value = var.aws_s3_secrets.access_key_id }
    SPAIRE_AWS_SECRET_ACCESS_KEY            = { value = var.aws_s3_secrets.secret_access_key }
    SPAIRE_S3_FILES_DOWNLOAD_SALT           = { value = var.aws_s3_secrets.files_download_salt }
    SPAIRE_S3_FILES_DOWNLOAD_SECRET         = { value = var.aws_s3_secrets.files_download_secret }
  }
}

resource "render_env_group" "github" {
  environment_id = var.render_environment_id
  name           = "github-${var.environment}"
  env_vars = {
    SPAIRE_GITHUB_CLIENT_ID                           = { value = var.github_secrets.client_id }
    SPAIRE_GITHUB_CLIENT_SECRET                       = { value = var.github_secrets.client_secret }
    SPAIRE_GITHUB_REPOSITORY_BENEFITS_APP_IDENTIFIER  = { value = var.github_secrets.repository_benefits_app_identifier }
    SPAIRE_GITHUB_REPOSITORY_BENEFITS_APP_NAMESPACE   = { value = var.github_secrets.repository_benefits_app_namespace }
    SPAIRE_GITHUB_REPOSITORY_BENEFITS_APP_PRIVATE_KEY = { value = var.github_secrets.repository_benefits_app_private_key }
    SPAIRE_GITHUB_REPOSITORY_BENEFITS_CLIENT_ID       = { value = var.github_secrets.repository_benefits_client_id }
    SPAIRE_GITHUB_REPOSITORY_BENEFITS_CLIENT_SECRET   = { value = var.github_secrets.repository_benefits_client_secret }
  }
}

resource "render_env_group" "stripe" {
  environment_id = var.render_environment_id
  name           = "stripe-${var.environment}"
  env_vars = {
    SPAIRE_STRIPE_CONNECT_WEBHOOK_SECRET = { value = var.stripe_secrets.connect_webhook_secret }
    SPAIRE_STRIPE_SECRET_KEY             = { value = var.stripe_secrets.secret_key }
    SPAIRE_STRIPE_WEBHOOK_SECRET         = { value = var.stripe_secrets.webhook_secret }
  }
}

resource "render_env_group" "logfire_server" {
  count          = var.logfire_config != null ? 1 : 0
  environment_id = var.render_environment_id
  name           = "logfire-server${local.env_suffix}"
  env_vars = {
    SPAIRE_LOGFIRE_PROJECT_NAME = { value = var.logfire_config.server_project_name }
    SPAIRE_LOGFIRE_TOKEN        = { value = var.logfire_config.server_token }
  }
}

resource "render_env_group" "logfire_worker" {
  count          = var.logfire_config != null ? 1 : 0
  environment_id = var.render_environment_id
  name           = "logfire-worker${local.env_suffix}"
  env_vars = {
    SPAIRE_LOGFIRE_PROJECT_NAME = { value = var.logfire_config.worker_project_name }
    SPAIRE_LOGFIRE_TOKEN        = { value = var.logfire_config.worker_token }
  }
}


resource "render_env_group" "apple" {
  environment_id = var.render_environment_id
  name           = "apple-${var.environment}"
  env_vars = {
    SPAIRE_APPLE_CLIENT_ID = { value = var.apple_secrets.client_id }
    SPAIRE_APPLE_TEAM_ID   = { value = var.apple_secrets.team_id }
    SPAIRE_APPLE_KEY_ID    = { value = var.apple_secrets.key_id }
    SPAIRE_APPLE_KEY_VALUE = { value = var.apple_secrets.key_value }
  }
}

resource "render_env_group" "prometheus" {
  count          = var.prometheus_config != null ? 1 : 0
  environment_id = var.render_environment_id
  name           = "prometheus-${var.environment}"
  env_vars = {
    SPAIRE_PROMETHEUS_REMOTE_WRITE_URL      = { value = var.prometheus_config.url }
    SPAIRE_PROMETHEUS_REMOTE_WRITE_USERNAME = { value = var.prometheus_config.username }
    SPAIRE_PROMETHEUS_REMOTE_WRITE_PASSWORD = { value = var.prometheus_config.password }
    SPAIRE_PROMETHEUS_REMOTE_WRITE_INTERVAL = { value = var.prometheus_config.interval }
  }
}

resource "render_env_group" "tinybird" {
  count          = var.tinybird_config != null ? 1 : 0
  environment_id = var.render_environment_id
  name           = "tinybird-${var.environment}"
  env_vars = {
    SPAIRE_TINYBIRD_API_URL             = { value = var.tinybird_config.api_url }
    SPAIRE_TINYBIRD_CLICKHOUSE_URL      = { value = var.tinybird_config.clickhouse_url }
    SPAIRE_TINYBIRD_API_TOKEN           = { value = var.tinybird_config.api_token }
    SPAIRE_TINYBIRD_CLICKHOUSE_USERNAME = { value = var.tinybird_config.clickhouse_username }
    SPAIRE_TINYBIRD_CLICKHOUSE_TOKEN    = { value = var.tinybird_config.clickhouse_token }
    SPAIRE_TINYBIRD_WORKSPACE           = { value = var.tinybird_config.workspace }
    SPAIRE_TINYBIRD_EVENTS_WRITE        = { value = var.tinybird_config.events_write }
    SPAIRE_TINYBIRD_EVENTS_READ         = { value = var.tinybird_config.events_read }
  }
}

# Services


resource "render_web_service" "api" {
  environment_id     = var.render_environment_id
  name               = "api${local.env_suffix}"
  plan               = var.api_service_config.plan
  region             = "ohio"
  health_check_path  = "/healthz"
  pre_deploy_command = "uv run task pre_deploy"

  runtime_source = {
    image = {
      image_url              = "ghcr.io/polarsource/polar"
      tag                    = "latest"
      registry_credential_id = var.registry_credential_id
    }
  }

  lifecycle {
    ignore_changes = [
      runtime_source.image.image_url,
      runtime_source.image.digest,
      runtime_source.image.tag,
    ]
  }

  autoscaling = var.environment == "production" ? {
    enabled = true
    min     = 1
    max     = 2
    criteria = {
      cpu = {
        enabled    = true
        percentage = 90
      }
      memory = {
        enabled    = true
        percentage = 90
      }
    }
  } : null

  custom_domains = var.api_service_config.custom_domains

  env_vars = {
    WEB_CONCURRENCY              = { value = var.api_service_config.web_concurrency }
    FORWARDED_ALLOW_IPS          = { value = var.api_service_config.forwarded_allow_ips }
    SPAIRE_ALLOWED_HOSTS          = { value = var.api_service_config.allowed_hosts }
    SPAIRE_CORS_ORIGINS           = { value = var.api_service_config.cors_origins }
    SPAIRE_DATABASE_POOL_SIZE     = { value = var.api_service_config.database_pool_size }
    SPAIRE_POSTGRES_DATABASE      = { value = var.api_service_config.postgres_database }
    SPAIRE_POSTGRES_HOST          = { value = var.postgres_config.host }
    SPAIRE_POSTGRES_PORT          = { value = var.postgres_config.port }
    SPAIRE_POSTGRES_USER          = { value = var.postgres_config.user }
    SPAIRE_POSTGRES_PWD           = { value = var.postgres_config.password }
    SPAIRE_POSTGRES_READ_DATABASE = { value = var.api_service_config.postgres_read_database }
    SPAIRE_POSTGRES_READ_HOST     = { value = var.postgres_config.read_host }
    SPAIRE_POSTGRES_READ_PORT     = { value = var.postgres_config.read_port }
    SPAIRE_POSTGRES_READ_USER     = { value = var.postgres_config.read_user }
    SPAIRE_POSTGRES_READ_PWD      = { value = var.postgres_config.read_password }
    SPAIRE_REDIS_HOST             = { value = var.redis_config.host }
    SPAIRE_REDIS_PORT             = { value = var.redis_config.port }
    SPAIRE_REDIS_DB               = { value = var.api_service_config.redis_db }
  }
}

resource "render_web_service" "worker" {
  for_each = var.workers

  environment_id    = var.render_environment_id
  name              = each.key
  plan              = each.value.plan
  region            = "ohio"
  health_check_path = "/"
  start_command     = each.value.start_command
  num_instances     = each.value.num_instances

  runtime_source = {
    image = each.value.digest != null ? {
      image_url              = "ghcr.io/polarsource/polar"
      registry_credential_id = var.registry_credential_id
      digest                 = each.value.digest
      } : {
      image_url              = "ghcr.io/polarsource/polar"
      registry_credential_id = var.registry_credential_id
      tag                    = each.value.tag
    }
  }

  lifecycle {
    ignore_changes = [
      runtime_source.image.image_url,
      runtime_source.image.tag,
      runtime_source.image.digest,
    ]
  }

  custom_domains = length(each.value.custom_domains) > 0 ? each.value.custom_domains : null

  env_vars = {
    dramatiq_prom_port           = { value = each.value.dramatiq_prom_port }
    SPAIRE_DATABASE_POOL_SIZE     = { value = each.value.database_pool_size }
    SPAIRE_POSTGRES_DATABASE      = { value = var.api_service_config.postgres_database }
    SPAIRE_POSTGRES_HOST          = { value = var.postgres_config.host }
    SPAIRE_POSTGRES_PORT          = { value = var.postgres_config.port }
    SPAIRE_POSTGRES_USER          = { value = var.postgres_config.user }
    SPAIRE_POSTGRES_PWD           = { value = var.postgres_config.password }
    SPAIRE_POSTGRES_READ_DATABASE = { value = var.api_service_config.postgres_read_database }
    SPAIRE_POSTGRES_READ_HOST     = { value = var.postgres_config.read_host }
    SPAIRE_POSTGRES_READ_PORT     = { value = var.postgres_config.read_port }
    SPAIRE_POSTGRES_READ_USER     = { value = var.postgres_config.read_user }
    SPAIRE_POSTGRES_READ_PWD      = { value = var.postgres_config.read_password }
    SPAIRE_REDIS_HOST             = { value = var.redis_config.host }
    SPAIRE_REDIS_PORT             = { value = var.redis_config.port }
    SPAIRE_REDIS_DB               = { value = var.api_service_config.redis_db }
  }
}

locals {
  env_suffix      = var.environment == "production" ? "" : "-${var.environment}"
  worker_ids      = [for w in render_web_service.worker : w.id]
  all_service_ids = concat([render_web_service.api.id], local.worker_ids)
}

# Env group links
resource "render_env_group_link" "aws_s3" {
  env_group_id = render_env_group.aws_s3.id
  service_ids  = local.all_service_ids
}

resource "render_env_group_link" "google" {
  env_group_id = render_env_group.google.id
  service_ids  = local.all_service_ids
}

resource "render_env_group_link" "github" {
  env_group_id = render_env_group.github.id
  service_ids  = local.all_service_ids
}

resource "render_env_group_link" "backend" {
  env_group_id = render_env_group.backend.id
  service_ids  = local.all_service_ids
}

resource "render_env_group_link" "backend_production" {
  count        = var.environment == "production" ? 1 : 0
  env_group_id = render_env_group.backend_production[0].id
  service_ids  = local.all_service_ids
}

resource "render_env_group_link" "stripe" {
  env_group_id = render_env_group.stripe.id
  service_ids  = local.all_service_ids
}

resource "render_env_group_link" "logfire_server" {
  count        = var.logfire_config != null ? 1 : 0
  env_group_id = render_env_group.logfire_server[0].id
  service_ids  = [render_web_service.api.id]
}

resource "render_env_group_link" "logfire_worker" {
  count        = var.logfire_config != null ? 1 : 0
  env_group_id = render_env_group.logfire_worker[0].id
  service_ids  = local.worker_ids
}

resource "render_env_group_link" "openai" {
  env_group_id = render_env_group.openai.id
  service_ids  = local.all_service_ids
}

resource "render_env_group_link" "apple" {
  env_group_id = render_env_group.apple.id
  service_ids  = [render_web_service.api.id]
}

resource "render_env_group_link" "prometheus" {
  count        = var.prometheus_config != null ? 1 : 0
  env_group_id = render_env_group.prometheus[0].id
  service_ids  = local.all_service_ids
}

resource "render_env_group_link" "tinybird" {
  count        = var.tinybird_config != null ? 1 : 0
  env_group_id = render_env_group.tinybird[0].id
  service_ids  = local.all_service_ids
}
