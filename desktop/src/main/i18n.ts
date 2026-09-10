/**
 * Lightweight i18n module for the Electron main process.
 *
 * Mirrors the renderer's i18nService pattern but runs in Node (no DOM/window).
 * Keeps only the small subset of keys needed by main-process code
 * (tray menu, session titles, etc.).
 *
 * Usage:
 *   import { t, setLanguage } from './i18n';
 *   setLanguage('en');
 *   const label = t('trayShowWindow'); // "Open Maties"
 *   const msg = t('imMissingCredentials', { fields: 'appId, appSecret' });
 */

// Maties is English-only; 'zh' stays in the type for persisted configs and is coerced.
export type LanguageType = 'zh' | 'en';

const translations: Record<'en', Record<string, string>> = {
  en: {
    // DeepSeek Harness (experimental)
    dshWorkbenchTitle: 'DeepSeek Harness Workbench (Experimental)',
    dshPlanProviderName: 'Plan',

    // Tray menu
    trayShowWindow: 'Open Maties',
    trayNewTask: 'New Task',
    trayViewCompletedTask: 'View Completed Task',
    trayCompletedTaskTooltip: 'Maties - {count} completed task(s)',
    traySettings: 'Settings',
    trayQuit: 'Quit',

    // Quit confirmation (native dialog shown on user-initiated quit)
    appQuitConfirmTitle: 'Quit Maties?',
    appQuitConfirmDetail: 'While Maties is closed, scheduled tasks will not run and IM messages will not be answered.',
    appQuitConfirmQuit: 'Quit',
    appQuitConfirmCancel: 'Cancel',
    taskCompletionNotificationTitle: 'Task Complete',
    taskCompletionNotificationBody: 'A task has finished. Click to view the result.',
    taskCompletionOverlayDescription: 'Task complete',
    permissionNotificationTitle: 'Waiting for Your Confirmation',
    permissionNotificationBody: 'The agent requests to run {toolName} and is waiting for your confirmation.',
    permissionNotificationBodyGeneric: 'The agent requests to run an action and is waiting for your confirmation.',
    questionNotificationTitle: 'Waiting for Your Answer',
    questionNotificationBody: 'Waiting for your answer to continue.',
    browserCredentialApprovalHeader: 'Saved login',
    browserCredentialApprovalTitle: 'Allow Agent sign-in',
    browserCredentialApprovalSubtitle: 'Maties fills the isolated page without revealing the password to the Agent.',
    browserCredentialApprovalQuestion: 'Allow the Agent to sign in to {origin} as {username}?',
    browserCredentialApprovalReason: 'Reason from the Agent: {reason}',
    browserCredentialApprovalAllow: 'Allow and continue',
    browserCredentialApprovalAllowDescription: 'Fill the saved username and password and continue the current task',
    browserCredentialApprovalDeny: 'Deny',
    browserCredentialApprovalDenyDescription: 'Do not use the saved login',
    browserCredentialSelectionQuestion: 'Choose an account the Agent may use to sign in to {origin}',
    browserCredentialSelectionTitle: 'Choose a sign-in account',
    browserCredentialSelectionSubtitle: 'Maties will fill the selected account automatically.',
    browserCredentialSelectionDescription: 'Continue with this account',
    contextMenuCut: 'Cut',
    contextMenuCopy: 'Copy',
    contextMenuPaste: 'Paste',
    contextMenuSelectAll: 'Select All',

    // Session titles
    coworkDefaultSessionTitle: 'New Chat',
    cronSessionPrefix: 'Cron',
    channelPrefixFeishu: 'Feishu',
    channelPrefixDingtalk: 'DingTalk',
    channelPrefixWecom: 'WeCom',
    channelPrefixNim: 'NIM',
    channelPrefixWeixin: 'WeChat',
    channelPrefixNeteaseBee: 'Xiaomifeng',
    channelPrefixEmail: 'Email',
    // NIM chat type labels
    nimQChat: 'QChat',
    nimGroup: 'Group',

    // Timeout hint
    taskTimedOut:
      '[Task timed out] The task was automatically stopped because it exceeded the maximum allowed duration. You can continue the conversation to pick up where it left off.',
    imSessionStoppedReply:
      'The task was manually stopped. You can send a new message to start a fresh conversation.',

    // OAuth flow messages
    qwenOAuthRequestingDeviceCode: 'Requesting device authorization code...',
    qwenOAuthOpeningBrowser: 'Opening browser for authorization...',
    qwenOAuthWaitingForUser: 'Waiting for user authorization...',
    qwenOAuthSuccess: 'OAuth authorization successful',
    qwenOAuthFailed: 'OAuth authorization failed',
    qwenOAuthTimeout: 'OAuth authorization timeout',
    // Thinking-only hint
    taskThinkingOnly:
      '[No output] The model finished thinking but did not generate a visible reply. You can continue the conversation to ask it to output the result.',
    taskOutputTruncated:
      '[Output incomplete] The model reached the output limit for this response. The partial result was preserved, but the task is not confirmed complete. Continue the conversation to resume.',

    // Feishu bot install
    feishuVerifyCredentialsFailed:
      'Credential validation failed. Please check your App ID and App Secret.',
    feishuVerifyFailed: 'Verification failed',

    // Cowork error messages
    coworkErrorAuthInvalid: 'Invalid or expired API key. Please check your configuration.',
    coworkErrorMatiesLoginExpired:
      'Your login session has expired. Sign in again to continue using Maties plan models.',
    coworkErrorOAuthInvalid: 'OAuth authorization is invalid or missing required access. Re-authenticate and try again.',
    coworkErrorModelAccessDenied: 'This account is not allowed to access the selected model. Switch models or check provider account permissions.',
    coworkErrorQuotaExhausted:
      'Your credits have been used up. Upgrade your plan to continue.\n\n[Upgrade or recharge](https://app.claidor.com/)',
    coworkErrorFreeQuotaExhausted:
      'Your credits have been used up. Upgrade your plan to continue.\n\n[Upgrade or recharge](https://app.claidor.com/)',
    coworkErrorEnterpriseMemberQuotaExhausted: 'The current team member period quota has been used up.',
    coworkErrorEnterprisePoolExhausted: 'The current team credit pool has been used up.',
    coworkErrorEnterpriseCreditBatchesExpired: 'All credit batches for the current team have expired.',
    coworkErrorInsufficientBalance: 'Insufficient API balance. Please top up and try again.',
    coworkErrorInputTooLong: 'Input too long, exceeding model context limit.',
    coworkErrorMessageTooLarge:
      'This message is too large. Reduce attachments, compress images, or split it up. (Keep each message under about 30 MB.)',
    coworkErrorCouldNotProcessPdf: 'Unable to process the PDF file.',
    coworkErrorModelNotFound: 'The requested model does not exist or is unavailable.',
    coworkGatewaySessionSyncTimeout: 'The OpenClaw engine is responding slowly and your message has not been sent. Please wait a minute or two and resend. If this happens frequently, check system memory and disk usage, and add Maties to your antivirus allowlist.',
    coworkErrorTranscriptOversized: 'This task history is too large. The message was not sent to protect the AI engine. Continue in a new task; the original task will be preserved.',
    coworkErrorGatewayHeapOutOfMemory: 'The local AI engine ran out of memory and is restarting automatically. This task may be too large; wait for recovery and continue in a new task.',
    coworkErrorGatewayDisconnected: 'AI engine connection lost. Please retry.',
    coworkErrorServiceRestart: 'AI engine is restarting. Please try again later.',
    coworkErrorGatewayDraining: 'AI engine is restarting. Please wait a moment and try again.',
    openClawConfigApplyPending: 'OpenClaw is applying configuration. Please try again shortly.',
    openClawConfigApplyOverdue:
      'OpenClaw is waiting for active tasks to finish before applying configuration. Complete or stop the active tasks, then try again.',
    coworkErrorModelResponseTimeout: 'The model response timed out. Please try again.',
    coworkErrorNetworkError: 'Network connection failed. Please check your network settings.',
    coworkErrorRateLimit: 'Too many requests. Please try again later.',
    coworkErrorModelOverloaded:
      'The model service is temporarily busy or at capacity. Please try again later.',
    coworkErrorContentFiltered:
      'Content did not pass the safety review. Please modify and try again.',
    coworkErrorToolLoopBlocked:
      'This turn was stopped safely because the AI kept repeating the same tool call with no new progress (usually while waiting on a slow background task). The background task may still be running — send another message to continue.',
    coworkErrorServerError: 'Server error occurred. Please try again later.',
    coworkErrorEngineNotReady: 'AI engine is starting up. Please wait a few seconds and try again.',
    serverModelMetadataUnavailable:
      'Package model information is temporarily unavailable. Refresh and try again.',
    serverModelRuntimeProfileUnsupported:
      'This package model task profile is not supported by the current version.',
    serverModelToolCallingUnavailable:
      'Agent tool calling is not enabled for this model yet.',
    serverModelAgenticNotReady:
      'This model is still undergoing agent capability validation. Please try again later.',
    coworkErrorModelStreamEmptySseData:
      'Model stream format error: the model service returned an empty SSE data frame. Please retry later or check the current model proxy configuration.',
    coworkErrorModelStreamOnlyEmptySseData:
      'Model stream stayed empty: the model service kept returning empty SSE data frames. Please retry later or check the current model proxy configuration.',
    coworkErrorUnknown:
      'Task failed due to an unexpected error. Please retry. If the issue persists, check your model configuration.',
    coworkBtwDisconnected: 'The AI engine disconnected before the BTW side question completed.',
    coworkBtwTimeout: 'The BTW side question timed out. Please try again.',
    coworkBtwInvalidResult: 'The AI engine returned an invalid BTW side-question result.',
    coworkBtwFailed: 'The BTW side question failed. Please try again.',
    coworkBtwRequestRequired: 'Session, run id, and BTW side question are required.',
    coworkBtwInvalidIdentifier: 'The BTW session or run identifier is invalid.',
    coworkBtwQuestionRequired: 'Enter a BTW side question.',
    coworkBtwSingleLine: 'BTW side questions currently support one line only.',
    coworkBtwResultTruncated: '(Answer truncated because it was too long.)',
    coworkBtwAlreadyPending: 'This conversation already has a pending BTW side question.',
    coworkBtwRunConflict: 'The BTW side-question run id conflicts with an existing run.',
    coworkBtwSessionNotFound: 'Session {sessionId} was not found.',
    coworkBtwUnavailable: 'BTW side questions are unavailable in the current runtime.',
    coworkBtwSubmitFailed: 'Failed to submit the BTW side question.',
    coworkBtwNoPending: 'No pending BTW side question was found.',
    coworkBtwStopFailed: 'Failed to stop the BTW side question. Please try again.',
    imErrorPrefix: 'Error processing message',

    // Exec approval continuation
    execApprovalApproved:
      'The user approved the command execution. Please check the result and continue.',
    execApprovalDenied: 'The user denied the command execution.',

    // Skill manager errors
    skillErrNoSkillMd: 'No SKILL.md found in source',
    skillErrInvalidSource:
      'Invalid skill source. Use owner/repo, repo URL, npm package spec, ClawHub URL, or a GitHub tree/blob URL.',
    skillErrClawhubNotFound: 'Skill not found on ClawHub. Please check the URL.',
    skillErrClawhubDownloadFailed: 'Failed to download skill from ClawHub. Please try again later.',

    // Auth quota
    authPlanFree: 'Free',
    authPlanStandard: 'Standard',
    enterpriseAccountContextMismatchTitle: 'Team identity expired',
    enterpriseAccountContextMismatchMessage:
      'Your team identity no longer matches the login credentials. Related image and video polling has stopped. Sign in again or choose a team identity before retrying.',
    enterpriseAccountContextMismatchConfirm: 'OK',
    authAccountChanged: 'The signed-in account changed. Try again.',
    authLoginRequired: 'Sign in and try again.',
    mediaTaskAccountMismatch: 'This media task belongs to another account.',
    enterpriseMediaQuotaUnavailable: 'Media generation quota is unavailable for this team.',

    // Data migration dialogs
    dataMigrationBackupDialogTitle: 'Back Up Maties Data',
    dataMigrationRestoreDialogTitle: 'Import Maties Data Backup',
    dataMigrationBackupArchiveFilter: 'Maties Backup',
    dataMigrationAllFilesFilter: 'All Files',
    dataMigrationBackupBlockedByActiveWorkloads:
      'An agent or scheduled task is still running. Stop it or wait for it to finish before backing up.',
    dataMigrationRestoreProgressTitle: 'Importing Maties data',
    dataMigrationRestoreProgressDesc:
      'Restoring the backup and validating data. Maties will restart automatically when finished.',
    dataMigrationRestoreProgressWarning:
      'Do not close the app or restart the computer, or the migration may be interrupted.',

    // ── IM connectivity test messages ───────────────────────────────────
    // Common
    imMissingCredentials: 'Missing required configuration: {fields}',
    imFillCredentials: 'Please complete the configuration and test connectivity again.',
    imAuthProbeTimeout: 'Authentication probe timed out',
    imAuthFailed: 'Authentication failed: {error}',
    imAuthFailedSuggestion:
      'Please check that your ID/Secret/Token are correct and that bot permissions are enabled.',
    imChannelEnabledNotConnected: 'IM channel is enabled but not currently connected.',
    imChannelEnabledNotConnectedSuggestion:
      'Please check the network, bot configuration, and platform-side event settings.',
    imChannelRunning: 'IM channel is enabled and running normally.',
    imChannelNotEnabled: 'IM channel is not currently enabled.',
    imChannelNotEnabledSuggestion: 'Please click the IM channel toggle button to enable it.',
    imNoInboundAfter2Min: 'Connected for over 2 minutes but no inbound messages received.',
    imNoInboundSuggestion:
      'Please verify the bot is in the target conversation, or @mention the bot per platform rules.',
    imInboundDetected: 'Inbound messages detected.',
    imGatewayJustStarted:
      'Gateway just started; inbound activity check will be more accurate after 2 minutes.',
    imNoOutbound: 'Messages received but no successful outbound reply observed.',
    imNoOutboundSuggestion:
      'Please check message send permissions, bot visibility scope, and reply permissions.',
    imOutboundDetected: 'Successful outbound reply detected.',
    imNoInboundForOutboundCheck:
      'No inbound messages received yet to evaluate outbound capability.',
    imRecentError: 'Recent error: {error}',
    imRecentErrorConnectedSuggestion:
      'Currently connected, but fixing this error is recommended to prevent future interruptions.',
    imRecentErrorDisconnectedSuggestion:
      'This error may block conversations. Please fix it and retry.',
    imConfigIncomplete: 'Configuration incomplete',
    imUnknownPlatform: 'Unknown platform.',

    // QQ
    imQqOpenClawHint:
      'QQ runs via OpenClaw runtime. The bot will connect automatically when OpenClaw Gateway starts.',
    imQqMentionHint:
      '@mention the bot in channels to start a conversation. Direct messages and group chats are also supported.',
    imQqAuthPassed: 'QQ authentication passed (AccessToken obtained).',
    imEmailImapAuthPassed: 'IMAP email login verification passed.',
    imEmailImapAuthFailed: 'IMAP email login verification failed',
    imEmailWsAuthPassed: 'API Key configured.',
    imQqAccessTokenFailed: 'Failed to obtain AccessToken',
    imQqFillAppIdSecret: 'Please provide the AppID and AppSecret and test connectivity again.',
    imQqAuthFailed: 'QQ authentication failed: {error}',
    imQqCheckAppIdSecret:
      'Please check that the AppID and AppSecret are correct and that bot permissions are enabled.',

    // Telegram
    imTelegramMissingBotToken: 'Missing required configuration: botToken',
    imTelegramFillBotToken: 'Please provide the Bot Token and test connectivity again.',
    imTelegramAuthPassed: 'Telegram Bot authentication passed: @{username}',
    imTelegramAuthFailed: 'Telegram Bot authentication failed: {error}',
    imTelegramAuthFailedUnknown: 'Unknown error',
    imTelegramCheckToken: 'Please check that the Bot Token is correct.',
    imTelegramCheckTokenNetwork:
      'Please check that the Bot Token is correct and the network is reachable.',
    imTelegramOpenClawHint:
      'Telegram runs via OpenClaw runtime. The bot will connect automatically when OpenClaw Gateway starts.',

    // Discord
    imDiscordMissingBotToken: 'Missing required configuration: botToken',
    imDiscordFillBotToken: 'Please provide the Bot Token and test connectivity again.',
    imDiscordAuthPassed: 'Discord Bot authentication passed (Bot: {username}).',
    imDiscordAuthFailed: 'Discord Bot authentication failed: {error}',
    imDiscordCheckTokenNetwork:
      'Please check that the Bot Token is correct and the network is reachable.',
    imDiscordOpenClawHint:
      'Discord runs via OpenClaw runtime. The bot will connect automatically when OpenClaw Gateway starts.',
    imDiscordGroupMention: 'Discord only responds to @mentioned messages in group chats.',

    // Feishu
    imFeishuFillAppIdSecret:
      'Please provide the App ID and App Secret and test connectivity again.',
    imFeishuAuthPassed: 'Feishu authentication passed (Bot: {botName})',
    imFeishuAuthFailed: 'Feishu authentication failed: {error}',
    imFeishuCheckAppIdSecret: 'Please check that the App ID and App Secret are correct.',
    imFeishuOpenClawHint:
      'Feishu runs via OpenClaw runtime. The bot will connect automatically when OpenClaw Gateway starts.',
    imFeishuGroupMention: 'Feishu only responds to @mentioned messages in group chats.',
    imFeishuGroupMentionSuggestion:
      'Please @mention the bot in group chats to start a conversation.',
    imFeishuEventSubscription:
      'Feishu requires the message event subscription (im.message.receive_v1) to receive messages.',
    imFeishuEventSubscriptionSuggestion:
      'Please verify event subscriptions, permissions, and publish status in the Feishu Developer Console.',
    imFeishuAuthPassedWithBot: 'Feishu authentication passed (Bot: {botName}).',

    // DingTalk
    imDingtalkFillClientIdSecret:
      'Please provide the Client ID and Client Secret and test connectivity again.',
    imDingtalkAuthPassed: 'DingTalk authentication passed.',
    imDingtalkAuthFailed: 'DingTalk authentication failed: {error}',
    imDingtalkCheckClientIdSecret:
      'Please check that the Client ID and Client Secret are correct and that bot permissions are enabled.',
    imDingtalkOpenClawHint:
      'DingTalk runs via OpenClaw runtime. The bot will connect automatically when OpenClaw Gateway starts.',
    imDingtalkBotMembership:
      'The DingTalk bot must be added to the target conversation with messaging permissions.',
    imDingtalkBotMembershipSuggestion:
      'Please verify the bot is in the target conversation and enterprise permissions allow sending and receiving messages.',

    // WeCom
    imWecomFillBotIdSecret: 'Please provide the Bot ID and Secret and test connectivity again.',
    imWecomConfigReady: 'WeCom configuration is ready (Bot ID: {botId}).',
    imWecomOpenClawHint:
      'WeCom runs via OpenClaw runtime. The bot will connect automatically when OpenClaw Gateway starts.',
    imWecomConfigReadyOpenClaw:
      'WeCom configuration is ready (Bot ID: {botId}), running via OpenClaw.',

    // Weixin
    imWeixinNotEnabled: 'WeChat channel is not currently enabled.',
    imWeixinEnableSuggestion: 'Please enable the WeChat channel and test connectivity again.',
    imWeixinConfigReady: 'WeChat configuration is ready.',
    imWeixinOpenClawHint:
      'WeChat runs via OpenClaw runtime. The bot will connect automatically when OpenClaw Gateway starts.',
    imWeixinConfigReadyOpenClaw: 'WeChat configuration is ready, running via OpenClaw.',

    // NIM
    imNimFillCredentials:
      'Please provide the AppKey, Account, and Token and test connectivity again.',
    imNimConfigReady: 'NIM configuration is ready (Account: {account}).',
    imNimOpenClawHint:
      'NIM runs via OpenClaw runtime. The bot will connect automatically when OpenClaw Gateway starts.',
    imNimP2pOnly: 'NIM currently only supports P2P (direct) messages.',
    imNimP2pOnlySuggestion:
      'Please send a direct message to the bot account to start a conversation.',

    // Netease Bee
    imNeteaseBeeConfigReady: 'Netease Bee configuration is ready (Client ID: {clientId}).',

    // POPO
    imPopoFillWebhookCredentials:
      'Please provide the appKey, appSecret, token, and aesKey and test connectivity again.',
    imPopoFillWsCredentials:
      'Please provide the appKey, appSecret, and aesKey and test connectivity again.',
    imPopoConfigReady: 'POPO configuration is ready.',
    imPopoOpenClawHint:
      'POPO runs via OpenClaw runtime. The bot will connect automatically when OpenClaw Gateway starts.',
    imPopoConfigReadyOpenClaw: 'POPO configuration is ready, running via OpenClaw.',

    // Email Channel
    emailSettings: 'Email Settings',
    emailInstance: 'Email Account',
    addEmailInstance: 'Add Email Account',
    emailInstanceName: 'Account Name',
    emailInstanceNamePlaceholder: 'e.g., Work Email',
    emailAddress: 'Email Address',
    emailAddressPlaceholder: 'user@example.com',
    emailPassword: 'Password',
    emailPasswordPlaceholder: 'Email password or app-specific password',
    emailApiKey: 'API Key',
    emailApiKeyPlaceholder: 'ck_live_xxxxxxxx',
    getApiKey: 'Get API Key',
    apiKeyHint: 'Click "Get API Key" to verify your email in browser',
    emailTransportMode: 'Transport Mode',
    emailTransportImap: 'IMAP/SMTP (Traditional)',
    emailTransportWs: 'WebSocket (Secure, no password required)',
    emailAgentBinding: 'Agent Binding',
    emailAgentBindingHint: 'All email conversations will be routed to the selected Agent',
    emailAllowFrom: 'Allowed Senders (Whitelist)',
    emailAllowFromPlaceholder: 'user@example.com\n*.trusted-domain.com\n*@company.com',
    emailAllowFromHint: 'Supports wildcards, one per line. Empty = accept all senders.',
    emailAdvancedOptions: 'Advanced Options',
    emailImapSmtpConfig: 'IMAP/SMTP Server Configuration',
    emailImapHost: 'IMAP Host',
    emailImapPort: 'IMAP Port',
    emailSmtpHost: 'SMTP Host',
    emailSmtpPort: 'SMTP Port',
    emailServerConfigHint: 'Leave empty to auto-detect from email domain',
    emailReplyStrategy: 'Reply Strategy',
    emailReplyMode: 'Reply Mode',
    emailReplyModeImmediate: 'Immediate (streaming, one email per block)',
    emailReplyModeAccumulated: 'Accumulated (streaming, buffered)',
    emailReplyModeComplete: 'Complete (wait for full response)',
    emailReplyTo: 'Reply Recipients',
    emailReplyToSender: 'Sender only',
    emailReplyToAll: 'Sender + all recipients',
    emailA2aConfig: 'Agent-to-Agent Configuration',
    emailA2aEnabled: 'Enable A2A',
    emailA2aAgentDomains: 'Agent Domains',
    emailA2aAgentDomainsPlaceholder: 'agents.example.com',
    emailA2aAgentDomainsHint: 'Domains allowed for agent collaboration, one per line',
    emailA2aMaxTurns: 'A2A Max Ping-Pong Turns',
    emailConnectivityFailAlert: 'Connectivity test failed, please check your configuration',
    emailConnected: 'Connected',
    emailDisconnected: 'Disconnected',
    emailSaveSuccess: 'Configuration saved',
    emailSaveError: 'Save failed',
    emailValidationError: 'Configuration validation failed',
    emailMaxInstancesExceeded: 'Maximum {count} email accounts supported',
    emailDuplicateEmail: 'Email address "{email}" is duplicated',
    emailDuplicateInstanceId: 'Instance ID "{id}" is duplicated',
    emailInvalidEmail: 'Invalid email address format',
    emailMissingPassword: 'Instance "{name}" uses IMAP mode but password is missing',
    emailMissingApiKey: 'Instance "{name}" uses WebSocket mode but API Key is missing',
    emailInvalidApiKey: 'Instance "{name}" has invalid API Key format (should start with ck_)',
    emailGatewayRestarting: 'Restarting OpenClaw Gateway...',
    emailDeleteConfirm: 'Delete email account "{name}"?',
    emailEnterValidEmailFirst: 'Please enter a valid email address first',
    emailVerifyInBrowserAndPaste:
      'Please complete verification in browser, then paste API Key here',
    testConnection: 'Test Connection',
    emailTestSuccess: 'Connection test successful!',
    emailTestFailed: 'Connection test failed: {error}',

    htmlShareAccessModeUpdateFailed: 'Failed to update access mode.',
    htmlShareStatusUpdateFailed: 'Failed to update share access.',
    nodeDeploymentAccessStatusApplyFailed:
      'The service was deployed, but its access settings could not be updated: {message}',

    'enterprise.updateBlocked': 'Updates are managed by enterprise',
  },
};

let currentLanguage: LanguageType = 'en';

/** Set the active language. Call this when app_config.language changes. */
export function setLanguage(_language: LanguageType): void {
  currentLanguage = 'en';
}

export function getLanguage(): LanguageType {
  return currentLanguage;
}

/**
 * Look up a translation key and optionally interpolate `{param}` placeholders.
 * Returns the key itself if no translation exists.
 *
 *   t('imMissingCredentials', { fields: 'appId, appSecret' })
 *   // => "Missing required settings: appId, appSecret"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let text = translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
