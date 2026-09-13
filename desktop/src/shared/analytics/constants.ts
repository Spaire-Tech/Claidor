// There is deliberately no endpoint here. Maties collects no usage
// analytics, so there is nowhere for an event to be sent — not NetEase's
// collector, where upstream sent them, and not Claidor either, which was
// accepting them and throwing them away.
//
// The action names below are kept: they are the app's own list of moments
// worth noticing, and they cost nothing while nothing is reported. If usage
// analytics is ever wanted, it gets designed and consented to then. Adding
// an address back here is not that design.

export const LogReporterProduct = {
  Maties: 'wisdom',
} as const;

export const LogReporterCategory = {
  Actions: 'actions',
} as const;

export const LogReporterActionPrefix = {
  Maties: 'maties_',
} as const;

export const LogReporterAction = {
  AgentCreateAction: 'maties_agent_create_action',
  AgentSettingsAction: 'maties_agent_settings_action',
  AgentEngineMaintenanceAction: 'maties_agent_engine_maintenance_action',
  AgentEngineSettingChanged: 'maties_agent_engine_setting_changed',
  AboutAction: 'maties_about_action',
  AccountMenuAction: 'maties_account_menu_action',
  AppStarted: 'maties_app_started',
  AppearanceSettingChanged: 'maties_appearance_setting_changed',
  ArtifactPreviewAction: 'maties_artifact_preview_action',
  ActivityClaimClick: 'maties_activity_claim_click',
  ActivityClaimFail: 'maties_activity_claim_fail',
  ActivityClaimSuccess: 'maties_activity_claim_success',
  ActivityEntryClick: 'maties_activity_entry_click',
  ActivityLoginRedirect: 'maties_activity_login_redirect',
  ActivityLoginSuccess: 'maties_activity_login_success',
  ActivityPopupClose: 'maties_activity_popup_close',
  ActivityPopupExposure: 'maties_activity_popup_exposure',
  AuthLifecycle: 'maties_auth_lifecycle',
  BrowserSettingChanged: 'maties_browser_setting_changed',
  CustomModelConnectionTested: 'maties_custom_model_connection_tested',
  CustomModelSettingsSaved: 'maties_custom_model_settings_saved',
  ConversationBlockAction: 'maties_conversation_block_action',
  ConversationMessageAction: 'maties_conversation_message_action',
  ConversationNavigationAction: 'maties_conversation_navigation_action',
  DailyCheckInAction: 'maties_daily_check_in_action',
  DreamingSettingChanged: 'maties_dreaming_setting_changed',
  DshAction: 'maties_dsh_action',
  EmailSkillConnectionTested: 'maties_email_skill_connection_tested',
  EmailSkillSettingsSaved: 'maties_email_skill_settings_saved',
  ExpertKitAction: 'maties_expert_kit_action',
  ExpertKitSelected: 'maties_expert_kit_selected',
  ExperimentalSettingChanged: 'maties_experimental_setting_changed',
  GeneralSettingChanged: 'maties_general_setting_changed',
  ImConnectionTested: 'maties_im_connection_tested',
  ImGatewayToggled: 'maties_im_gateway_toggled',
  ImInstanceChanged: 'maties_im_instance_changed',
  ImPromptSubmit: 'maties_im_prompt_submit',
  ImSettingsSaved: 'maties_im_settings_saved',
  LibraryAction: 'maties_library_action',
  MemoryEntryChanged: 'maties_memory_entry_changed',
  MemorySettingChanged: 'maties_memory_setting_changed',
  McpEnabled: 'maties_mcp_enabled',
  McpAction: 'maties_mcp_action',
  ModelSelected: 'maties_model_selected',
  OnboardingAction: 'maties_onboarding_action',
  PlanModeEnabled: 'maties_plan_mode_enabled',
  PluginAction: 'maties_plugin_action',
  PluginSettingsSaved: 'maties_plugin_settings_saved',
  PublishingDialogAction: 'maties_publishing_dialog_action',
  PublishingDialogExposure: 'maties_publishing_dialog_exposure',
  PublishingEntryAction: 'maties_publishing_entry_action',
  PublishingOperationResult: 'maties_publishing_operation_result',
  PublishingRecoveryCtaAction: 'maties_publishing_recovery_cta_action',
  PublishingRecoveryCtaExposure: 'maties_publishing_recovery_cta_exposure',
  PublishingRecoveryResult: 'maties_publishing_recovery_result',
  PublishingSubscriptionObserved: 'maties_publishing_subscription_observed',
  PublishShareResult: 'maties_publish_share_result',
  PublishCopyShareLink: 'maties_publish_copy_share_link',
  PublishDeploymentResult: 'maties_publish_deployment_result',
  PublishCopyDeployLink: 'maties_publish_copy_deploy_link',
  DeploymentEditorExposure: 'maties_deployment_editor_exposure',
  DeploymentEditorAction: 'maties_deployment_editor_action',
  DeploymentStatusExposure: 'maties_deployment_status_exposure',
  DeploymentStatusAction: 'maties_deployment_status_action',
  PromptControlAction: 'maties_prompt_control_action',
  PromptSubmit: 'maties_prompt_submit',
  PromptTemplateAction: 'maties_prompt_template_action',
  ShortcutSettingChanged: 'maties_shortcut_setting_changed',
  SidebarAction: 'maties_sidebar_action',
  SkillAction: 'maties_skill_action',
  SkillEnabled: 'maties_skill_enabled',
  ScheduledTaskAction: 'maties_scheduled_task_action',
  TaskSearchAction: 'maties_task_search_action',
  UsageAnalyticsEnabled: 'maties_usage_analytics_enabled',
} as const;

export const PublishingRecoveryAnalyticsInteractionType = {
  RecoveryCta: 'recovery_cta',
} as const;

export type PublishingRecoveryAnalyticsInteractionType =
  typeof PublishingRecoveryAnalyticsInteractionType[
    keyof typeof PublishingRecoveryAnalyticsInteractionType
  ];

export const PublishingRecoveryAnalyticsSurface = {
  TaskFileShareDialog: 'task_file_share_dialog',
  TaskSiteDeploymentDialog: 'task_site_deployment_dialog',
  LibraryCloudList: 'library_cloud_list',
  LibraryFileDetail: 'library_file_detail',
  LibrarySiteDetail: 'library_site_detail',
} as const;

export type PublishingRecoveryAnalyticsSurface =
  typeof PublishingRecoveryAnalyticsSurface[keyof typeof PublishingRecoveryAnalyticsSurface];

export const PublishingRecoveryAnalyticsOutcome = {
  Restored: 'restored',
  RedeployReady: 'redeploy_ready',
  RetryExhausted: 'retry_exhausted',
  ResourceUnavailable: 'resource_unavailable',
} as const;

export type PublishingRecoveryAnalyticsOutcome =
  typeof PublishingRecoveryAnalyticsOutcome[keyof typeof PublishingRecoveryAnalyticsOutcome];

export type LogEventAction = `${typeof LogReporterActionPrefix.Maties}${string}`;

export const LogReporterEntry = {
  PromptToolsMenu: 'prompt_tools_menu',
} as const;

export const LogReporterSource = {
  OpenClawChannel: 'openclaw_channel',
  SettingsExperimental: 'settings_experimental',
} as const;

export const PromptAnalyticsSurface = {
  Home: 'home',
  Conversation: 'conversation',
} as const;

export type PromptAnalyticsSurface =
  typeof PromptAnalyticsSurface[keyof typeof PromptAnalyticsSurface];

export const PromptAnalyticsConversationState = {
  NewTask: 'new_task',
  ContinueSession: 'continue_session',
} as const;

export type PromptAnalyticsConversationState =
  typeof PromptAnalyticsConversationState[keyof typeof PromptAnalyticsConversationState];

export const LogReporterStoreKey = {
  AppConfig: 'app_config',
  AuthUser: 'auth_user',
  InstallationUuid: 'installation_uuid',
} as const;
