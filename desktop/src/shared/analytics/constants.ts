// Usage events go to Claidor's API and nowhere else. The person can switch
// them off in Settings; the server acknowledges and keeps nothing yet.
export const LogReporterEndpoint = {
  Claidor: 'https://api.claidor.com/desktop/api/analytics/events',
} as const;

export const LogReporterProduct = {
  Swen: 'wisdom',
} as const;

export const LogReporterCategory = {
  Actions: 'actions',
} as const;

export const LogReporterActionPrefix = {
  Swen: 'swen_',
} as const;

export const LogReporterAction = {
  AgentCreateAction: 'swen_agent_create_action',
  AgentSettingsAction: 'swen_agent_settings_action',
  AgentEngineMaintenanceAction: 'swen_agent_engine_maintenance_action',
  AgentEngineSettingChanged: 'swen_agent_engine_setting_changed',
  AboutAction: 'swen_about_action',
  AccountMenuAction: 'swen_account_menu_action',
  AppStarted: 'swen_app_started',
  AppearanceSettingChanged: 'swen_appearance_setting_changed',
  ArtifactPreviewAction: 'swen_artifact_preview_action',
  ActivityClaimClick: 'swen_activity_claim_click',
  ActivityClaimFail: 'swen_activity_claim_fail',
  ActivityClaimSuccess: 'swen_activity_claim_success',
  ActivityEntryClick: 'swen_activity_entry_click',
  ActivityLoginRedirect: 'swen_activity_login_redirect',
  ActivityLoginSuccess: 'swen_activity_login_success',
  ActivityPopupClose: 'swen_activity_popup_close',
  ActivityPopupExposure: 'swen_activity_popup_exposure',
  AuthLifecycle: 'swen_auth_lifecycle',
  BrowserSettingChanged: 'swen_browser_setting_changed',
  CustomModelConnectionTested: 'swen_custom_model_connection_tested',
  CustomModelSettingsSaved: 'swen_custom_model_settings_saved',
  ConversationBlockAction: 'swen_conversation_block_action',
  ConversationMessageAction: 'swen_conversation_message_action',
  ConversationNavigationAction: 'swen_conversation_navigation_action',
  DailyCheckInAction: 'swen_daily_check_in_action',
  DreamingSettingChanged: 'swen_dreaming_setting_changed',
  DshAction: 'swen_dsh_action',
  EmailSkillConnectionTested: 'swen_email_skill_connection_tested',
  EmailSkillSettingsSaved: 'swen_email_skill_settings_saved',
  ExpertKitAction: 'swen_expert_kit_action',
  ExpertKitSelected: 'swen_expert_kit_selected',
  ExperimentalSettingChanged: 'swen_experimental_setting_changed',
  GeneralSettingChanged: 'swen_general_setting_changed',
  ImConnectionTested: 'swen_im_connection_tested',
  ImGatewayToggled: 'swen_im_gateway_toggled',
  ImInstanceChanged: 'swen_im_instance_changed',
  ImPromptSubmit: 'swen_im_prompt_submit',
  ImSettingsSaved: 'swen_im_settings_saved',
  LibraryAction: 'swen_library_action',
  MemoryEntryChanged: 'swen_memory_entry_changed',
  MemorySettingChanged: 'swen_memory_setting_changed',
  McpEnabled: 'swen_mcp_enabled',
  McpAction: 'swen_mcp_action',
  ModelSelected: 'swen_model_selected',
  OnboardingAction: 'swen_onboarding_action',
  PlanModeEnabled: 'swen_plan_mode_enabled',
  PluginAction: 'swen_plugin_action',
  PluginSettingsSaved: 'swen_plugin_settings_saved',
  PublishingDialogAction: 'swen_publishing_dialog_action',
  PublishingDialogExposure: 'swen_publishing_dialog_exposure',
  PublishingEntryAction: 'swen_publishing_entry_action',
  PublishingOperationResult: 'swen_publishing_operation_result',
  PublishingRecoveryCtaAction: 'swen_publishing_recovery_cta_action',
  PublishingRecoveryCtaExposure: 'swen_publishing_recovery_cta_exposure',
  PublishingRecoveryResult: 'swen_publishing_recovery_result',
  PublishingSubscriptionObserved: 'swen_publishing_subscription_observed',
  PublishShareResult: 'swen_publish_share_result',
  PublishCopyShareLink: 'swen_publish_copy_share_link',
  PublishDeploymentResult: 'swen_publish_deployment_result',
  PublishCopyDeployLink: 'swen_publish_copy_deploy_link',
  DeploymentEditorExposure: 'swen_deployment_editor_exposure',
  DeploymentEditorAction: 'swen_deployment_editor_action',
  DeploymentStatusExposure: 'swen_deployment_status_exposure',
  DeploymentStatusAction: 'swen_deployment_status_action',
  PromptControlAction: 'swen_prompt_control_action',
  PromptSubmit: 'swen_prompt_submit',
  PromptTemplateAction: 'swen_prompt_template_action',
  ShortcutSettingChanged: 'swen_shortcut_setting_changed',
  SidebarAction: 'swen_sidebar_action',
  SkillAction: 'swen_skill_action',
  SkillEnabled: 'swen_skill_enabled',
  ScheduledTaskAction: 'swen_scheduled_task_action',
  TaskSearchAction: 'swen_task_search_action',
  UsageAnalyticsEnabled: 'swen_usage_analytics_enabled',
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

export type LogEventAction = `${typeof LogReporterActionPrefix.Swen}${string}`;

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
