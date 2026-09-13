import { XCircleIcon as XCircleIconSolid } from '@heroicons/react/20/solid';
import React, { useCallback,useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { i18nService } from '../../services/i18n';
import { mcpService } from '../../services/mcp';
import {
  buildInstalledMcpItems,
  McpInstalledItem,
} from '../../services/mcpRegistryPresentation';
import { RootState } from '../../store';
import { setMcpServers } from '../../store/slices/mcpSlice';
import { McpServerConfig, McpServerFormData } from '../../types/mcp';
import CardOverflowMenu, { type CardOverflowMenuItem } from '../common/CardOverflowMenu';
import CardToggle from '../common/CardToggle';
import { MANAGEMENT_BODY_TEXT } from '../common/managementTypography';
import Modal from '../common/Modal';
import EmptyState from '../design/EmptyState';
import Pill from '../design/Pill';
import ErrorMessage from '../ErrorMessage';
import EditIcon from '../icons/EditIcon';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import SearchIcon from '../icons/SearchIcon';
import TrashIcon from '../icons/TrashIcon';
import {
  getFormAnalyticsParams,
  getServerAnalyticsParams,
  reportMcpAction,
} from './analytics';
import McpCard from './McpCard';
import McpDetailModal, { type McpDetailInfoRow, type McpDetailStat } from './McpDetailModal';
import McpServerFormModal from './McpServerFormModal';

const TRANSPORT_BADGE_COLORS: Record<string, string> = {
  stdio: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  sse: 'bg-green-500/10 text-green-600 dark:text-green-400',
  http: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

const LAUNCH_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
  installing: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ready: 'bg-green-500/10 text-green-600 dark:text-green-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  unsupported: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
};

type RegistryGroupItem = Extract<McpInstalledItem, { kind: 'registryGroup' }>;

type DeleteTarget =
  | { kind: 'server'; id: string; name: string; server: McpServerConfig }
  | {
    kind: 'registryGroup';
    id: string;
    name: string;
    registryId: string;
    servers: McpServerConfig[];
  };

/** Which card's detail dialog is open. Held by id so it tracks live data. */
type DetailTarget =
  | { kind: 'server'; id: string }
  | { kind: 'registryGroup'; registryId: string };

/** Management actions stay hidden until the card is hovered or focused. */
const CARD_MENU_REVEAL_CLASS =
  'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';

/**
 * « Your own servers », the last section of Settings → Apps.
 *
 * There is no catalogue here any more: the MCP marketplace was an empty shop
 * and the last screen in Maties that asked a person for an API key. What is
 * left is what a person actually owns — the servers they added by hand, and
 * the groups installed before the clear-out, which keep working.
 */
const McpManager: React.FC = () => {
  const dispatch = useDispatch();
  const servers = useSelector((state: RootState) => state.mcp.servers);

  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);

  useEffect(() => {
    let isActive = true;
    const loadServers = async () => {
      const loaded = await mcpService.loadServers();
      if (!isActive) return;
      dispatch(setMcpServers(loaded));
    };
    loadServers();
    return () => { isActive = false; };
  }, [dispatch]);

  useEffect(() => {
    return mcpService.onChanged(async () => {
      const loaded = await mcpService.loadServers();
      dispatch(setMcpServers(loaded));
    });
  }, [dispatch]);

  const getStdioCommandSummary = (command?: string, args?: string[]): string => {
    if (!command) return '';
    if (!args || args.length === 0) return command;
    return `${command} ${args[args.length - 1]}`;
  };

  const getTransportSummary = (server: McpServerConfig): string => {
    if (server.transportType === 'stdio') {
      const parts = [server.command || ''];
      if (server.args && server.args.length > 0) {
        parts.push(server.args[0]);
        if (server.args.length > 1) parts.push('...');
      }
      return parts.join(' ');
    }
    return server.url || '';
  };

  const getLaunchStatusLabel = (server: McpServerConfig): string | null => {
    if (server.transportType !== 'stdio') return null;
    const command = (server.command || '').trim().toLowerCase();
    const isManagedCandidate = command === 'npx' || command === 'npx.cmd';
    if (!server.launchResolution && !isManagedCandidate) return null;
    const status = server.launchResolution?.status;
    if (!status) return i18nService.t('mcpLaunchPending');
    if (status === 'pending') return i18nService.t('mcpLaunchPending');
    if (status === 'installing') return i18nService.t('mcpLaunchInstalling');
    if (status === 'ready') return i18nService.t('mcpLaunchReady');
    if (status === 'failed') return i18nService.t('mcpLaunchFailed');
    if (status === 'unsupported') return i18nService.t('mcpLaunchUnsupported');
    return null;
  };

  const getLaunchStatusClass = (server: McpServerConfig): string => {
    const status = server.launchResolution?.status || 'pending';
    return LAUNCH_STATUS_COLORS[status] || LAUNCH_STATUS_COLORS.pending;
  };

  const getInstalledDescription = useCallback((server: McpServerConfig): string => {
    const persistedDescription = server.description?.trim();
    if (persistedDescription) return persistedDescription;
    return getTransportSummary(server);
  }, []);

  const installedItems = useMemo(() => buildInstalledMcpItems(servers), [servers]);

  const getRegistryGroupDescription = useCallback((item: RegistryGroupItem): string => (
    item.servers.map(server => server.description).filter(Boolean).join(' / ')
  ), []);

  const getRegistryGroupTransportType = (item: RegistryGroupItem): string | null => {
    const transportTypes = new Set(item.servers.map(server => server.transportType));
    if (transportTypes.size !== 1) return null;
    return transportTypes.values().next().value ?? null;
  };

  const getRegistryGroupSummary = (item: RegistryGroupItem): string => {
    const summaries = new Set(item.servers.map(getTransportSummary).filter(Boolean));
    return summaries.size === 1 ? summaries.values().next().value ?? '' : '';
  };

  const filteredInstalled = useMemo(() => {
    const query = searchQuery.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!query) return installedItems;
    return installedItems.filter(item => {
      if (item.kind === 'server') {
        return item.server.name.toLowerCase().includes(query)
          || getInstalledDescription(item.server).toLowerCase().includes(query);
      }
      return item.registryId.toLowerCase().includes(query)
        || getRegistryGroupDescription(item).toLowerCase().includes(query)
        || item.servers.some(server =>
          server.name.toLowerCase().includes(query)
          || getInstalledDescription(server).toLowerCase().includes(query),
        );
    });
  }, [getInstalledDescription, getRegistryGroupDescription, installedItems, searchQuery]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) return undefined;
    const timer = window.setTimeout(() => {
      reportMcpAction('search', {
        source: 'mcp_manager',
        searchKeywordLength: query.length,
        resultCount: filteredInstalled.length,
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [filteredInstalled.length, searchQuery]);

  const handleToggleEnabled = async (serverId: string) => {
    const targetServer = servers.find(s => s.id === serverId);
    if (!targetServer) return;
    const targetEnabled = !targetServer.enabled;
    reportMcpAction('toggle_enabled', {
      source: 'mcp_manager',
      targetEnabled,
      ...getServerAnalyticsParams(targetServer),
    });
    try {
      const updatedServers = await mcpService.setServerEnabled(serverId, targetEnabled);
      dispatch(setMcpServers(updatedServers));
      setActionError('');
      reportMcpAction('toggle_enabled_success', {
        source: 'mcp_manager',
        targetEnabled,
        result: 'success',
        ...getServerAnalyticsParams(targetServer),
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : i18nService.t('mcpUpdateFailed'));
      reportMcpAction('toggle_enabled_failed', {
        source: 'mcp_manager',
        targetEnabled,
        result: 'failed',
        errorCode: 'toggle_failed',
        ...getServerAnalyticsParams(targetServer),
      });
    }
  };

  const handleRetryLaunchResolution = async (serverId: string) => {
    const targetServer = servers.find(s => s.id === serverId);
    setActionError('');
    if (targetServer) {
      reportMcpAction('launch_retry_submit', {
        source: 'mcp_manager',
        ...getServerAnalyticsParams(targetServer),
      });
    }
    const result = await mcpService.retryLaunchResolution(serverId);
    if (!result.success) {
      setActionError(result.error || i18nService.t('mcpUpdateFailed'));
      if (targetServer) {
        reportMcpAction('launch_retry_failed', {
          source: 'mcp_manager',
          result: 'failed',
          errorCode: 'launch_retry_failed',
          ...getServerAnalyticsParams(targetServer),
        });
      }
      return;
    }
    if (result.servers) {
      dispatch(setMcpServers(result.servers));
    }
    if (targetServer) {
      reportMcpAction('launch_retry_success', {
        source: 'mcp_manager',
        result: 'success',
        ...getServerAnalyticsParams(targetServer),
      });
    }
  };

  const handleRequestDelete = (server: McpServerConfig) => {
    setActionError('');
    reportMcpAction('delete_confirm_open', {
      source: 'mcp_manager',
      ...getServerAnalyticsParams(server),
    });
    setPendingDelete({ kind: 'server', id: server.id, name: server.name, server });
  };

  const handleRequestDeleteRegistry = (
    registryId: string,
    name: string,
    registryServers: McpServerConfig[],
  ) => {
    setActionError('');
    reportMcpAction('delete_confirm_open', {
      source: 'mcp_manager',
      registryId,
      mcpName: name,
    });
    setPendingDelete({
      kind: 'registryGroup',
      id: registryId,
      name,
      registryId,
      servers: registryServers,
    });
  };

  const getDeleteAnalyticsParams = (target: DeleteTarget) => (
    target.kind === 'server'
      ? getServerAnalyticsParams(target.server)
      : { registryId: target.registryId, mcpName: target.name }
  );

  const handleCancelDelete = () => {
    if (isDeleting) return;
    if (pendingDelete) {
      reportMcpAction('delete_confirm_cancel', {
        source: 'mcp_manager',
        ...getDeleteAnalyticsParams(pendingDelete),
      });
    }
    setPendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    setActionError('');
    const result = pendingDelete.kind === 'server'
      ? await mcpService.deleteServer(pendingDelete.id)
      : await mcpService.deleteByRegistryId(pendingDelete.registryId);
    if (!result.success) {
      setActionError(result.error || i18nService.t('mcpDeleteFailed'));
      setIsDeleting(false);
      reportMcpAction('delete_failed', {
        source: 'mcp_manager',
        result: 'failed',
        errorCode: 'delete_failed',
        ...getDeleteAnalyticsParams(pendingDelete),
      });
      return;
    }
    if (result.servers) {
      dispatch(setMcpServers(result.servers));
    }
    reportMcpAction('delete_success', {
      source: 'mcp_manager',
      result: 'success',
      ...getDeleteAnalyticsParams(pendingDelete),
    });
    setIsDeleting(false);
    setPendingDelete(null);
  };

  const handleToggleRegistryEnabled = async (
    registryId: string,
    registryServers: McpServerConfig[],
  ) => {
    const targetEnabled = !registryServers.some(server => server.enabled);
    reportMcpAction('toggle_enabled', {
      source: 'mcp_manager',
      targetEnabled,
      registryId,
      mcpName: registryId,
    });
    try {
      const updatedServers = await mcpService.setRegistryEnabled(registryId, targetEnabled);
      dispatch(setMcpServers(updatedServers));
      setActionError('');
      reportMcpAction('toggle_enabled_success', {
        source: 'mcp_manager',
        targetEnabled,
        result: 'success',
        registryId,
        mcpName: registryId,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : i18nService.t('mcpUpdateFailed'));
      reportMcpAction('toggle_enabled_failed', {
        source: 'mcp_manager',
        targetEnabled,
        result: 'failed',
        errorCode: 'toggle_failed',
        registryId,
        mcpName: registryId,
      });
    }
  };

  const handleOpenEditForm = (server: McpServerConfig) => {
    reportMcpAction('edit_open', {
      source: 'mcp_manager',
      ...getServerAnalyticsParams(server),
    });
    setEditingServer(server);
    setIsFormOpen(true);
  };

  /**
   * Edit and delete are rare next to enabling, so they live behind the menu.
   * The menu hangs off one server's card, so the labels stay bare verbs — the
   * object is already on screen.
   */
  const buildServerMenuItems = (server: McpServerConfig): CardOverflowMenuItem[] => [
    {
      key: 'edit',
      label: i18nService.t('edit'),
      icon: <EditIcon className="h-3.5 w-3.5" />,
      onSelect: () => handleOpenEditForm(server),
    },
    {
      key: 'delete',
      label: i18nService.t('delete'),
      icon: <TrashIcon className="h-3.5 w-3.5" />,
      destructive: true,
      onSelect: () => handleRequestDelete(server),
    },
  ];

  const handleCloseForm = () => {
    reportMcpAction('form_close', {
      source: 'mcp_manager',
      mode: editingServer ? 'edit' : 'create',
      ...(editingServer ? getServerAnalyticsParams(editingServer) : {}),
    });
    setIsFormOpen(false);
    setEditingServer(null);
  };

  const handleSaveForm = async (data: McpServerFormData) => {
    setActionError('');
    if (editingServer && editingServer.id) {
      reportMcpAction('edit_submit', {
        source: 'mcp_manager',
        ...getServerAnalyticsParams(editingServer),
        ...getFormAnalyticsParams(data),
      });
      const result = await mcpService.updateServer(editingServer.id, data);
      if (!result.success) {
        setActionError(result.error || i18nService.t('mcpUpdateFailed'));
        reportMcpAction('edit_failed', {
          source: 'mcp_manager',
          result: 'failed',
          errorCode: 'edit_failed',
          ...getServerAnalyticsParams(editingServer),
          ...getFormAnalyticsParams(data),
        });
        return;
      }
      if (result.servers) {
        dispatch(setMcpServers(result.servers));
      }
      reportMcpAction('edit_success', {
        source: 'mcp_manager',
        result: 'success',
        ...getServerAnalyticsParams(editingServer),
        ...getFormAnalyticsParams(data),
      });
    } else {
      reportMcpAction('create_submit', {
        source: 'mcp_manager',
        ...getFormAnalyticsParams(data),
      });
      const result = await mcpService.createServer(data);
      if (!result.success) {
        setActionError(result.error || i18nService.t('mcpCreateFailed'));
        reportMcpAction('create_failed', {
          source: 'mcp_manager',
          result: 'failed',
          errorCode: 'create_failed',
          ...getFormAnalyticsParams(data),
        });
        return;
      }
      if (result.servers) {
        dispatch(setMcpServers(result.servers));
      }
      reportMcpAction('create_success', {
        source: 'mcp_manager',
        result: 'success',
        ...getFormAnalyticsParams(data),
      });
    }
    handleCloseForm();
  };

  const handleImportJsonServers = async (
    list: McpServerFormData[],
  ): Promise<{ success: boolean; error?: string }> => {
    setActionError('');
    reportMcpAction('json_import_submit', {
      source: 'mcp_manager',
      serverCount: list.length,
    });
    let latestServers: McpServerConfig[] | undefined;
    for (const data of list) {
      const result = await mcpService.createServer(data);
      if (!result.success) {
        // Keep the servers created before the failure visible in the UI.
        if (latestServers) dispatch(setMcpServers(latestServers));
        reportMcpAction('json_import_failed', {
          source: 'mcp_manager',
          result: 'failed',
          errorCode: 'json_import_failed',
          serverCount: list.length,
        });
        return {
          success: false,
          error: `${data.name}: ${result.error || i18nService.t('mcpCreateFailed')}`,
        };
      }
      latestServers = result.servers ?? latestServers;
    }
    if (latestServers) dispatch(setMcpServers(latestServers));
    reportMcpAction('json_import_success', {
      source: 'mcp_manager',
      result: 'success',
      serverCount: list.length,
    });
    handleCloseForm();
    return { success: true };
  };

  const handleOpenCreateForm = () => {
    reportMcpAction('custom_create_open', { source: 'mcp_manager' });
    setEditingServer(null);
    setIsFormOpen(true);
  };

  const existingNames = useMemo(() => servers.map(s => s.name), [servers]);

  const openServerDetail = (server: McpServerConfig) => {
    reportMcpAction('open_detail', {
      source: 'mcp_manager',
      ...getServerAnalyticsParams(server),
    });
    setDetailTarget({ kind: 'server', id: server.id });
  };

  const openRegistryGroupDetail = (item: RegistryGroupItem) => {
    reportMcpAction('open_detail', {
      source: 'mcp_manager',
      registryId: item.registryId,
    });
    setDetailTarget({ kind: 'registryGroup', registryId: item.registryId });
  };

  const closeDetail = () => setDetailTarget(null);

  /** One server card. */
  const renderServerCard = (server: McpServerConfig) => {
    const launchStatusLabel = getLaunchStatusLabel(server);
    return (
      <McpCard
        key={server.id}
        title={server.name}
        description={getInstalledDescription(server)}
        onOpenDetail={() => openServerDetail(server)}
        actions={(
          <>
            <CardOverflowMenu
              className={CARD_MENU_REVEAL_CLASS}
              items={buildServerMenuItems(server)}
            />
            <CardToggle
              isOn={server.enabled}
              label={i18nService.t(server.enabled ? 'disable' : 'enable')}
              onToggle={() => handleToggleEnabled(server.id)}
            />
          </>
        )}
        meta={(
          <>
            <span className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${TRANSPORT_BADGE_COLORS[server.transportType] || ''}`}>
              {server.transportType}
            </span>
            {launchStatusLabel && (
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${getLaunchStatusClass(server)}`}
                title={server.launchResolution?.error || ''}
              >
                {launchStatusLabel}
              </span>
            )}
            {server.launchResolution?.status === 'failed' && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); handleRetryLaunchResolution(server.id); }}
                className="shrink-0 rounded bg-surface-raised px-1.5 py-0.5 font-medium text-primary transition-colors hover:bg-primary/10"
              >
                {i18nService.t('mcpLaunchRetry')}
              </button>
            )}
            {server.transportType === 'stdio' && server.command && (
              <>
                <span className="shrink-0 text-secondary/50">·</span>
                <span className="min-w-0 truncate">{getStdioCommandSummary(server.command, server.args)}</span>
              </>
            )}
            {(server.transportType === 'sse' || server.transportType === 'http') && server.url && (
              <>
                <span className="shrink-0 text-secondary/50">·</span>
                <span className="min-w-0 truncate">{server.url}</span>
              </>
            )}
          </>
        )}
      />
    );
  };

  const DETAIL_FOOTER_BUTTON_CLASS =
    `inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 ${MANAGEMENT_BODY_TEXT} text-secondary transition-colors hover:bg-surface-raised hover:text-foreground`;

  const DETAIL_FOOTER_DESTRUCTIVE_CLASS =
    `inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 ${MANAGEMENT_BODY_TEXT} text-secondary transition-colors hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400`;

  const renderDetailToggle = (isOn: boolean, onToggle: () => void) => (
    <div className="flex items-center gap-2.5">
      <span className={`${MANAGEMENT_BODY_TEXT} text-secondary`}>{i18nService.t('enable')}</span>
      <CardToggle
        isOn={isOn}
        label={i18nService.t(isOn ? 'disable' : 'enable')}
        onToggle={onToggle}
      />
    </div>
  );

  /** Keys only — values can hold secrets and detail is a read-only view. */
  const getKeyListValue = (record: Record<string, string> | undefined): string =>
    Object.keys(record ?? {}).join(', ');

  const renderServerDetail = (server: McpServerConfig) => {
    const launchStatusLabel = getLaunchStatusLabel(server);
    const stats: McpDetailStat[] = [
      {
        label: i18nService.t('mcpDetailStatus'),
        value: i18nService.t(server.enabled ? 'enabled' : 'disabled'),
      },
      { label: i18nService.t('mcpDetailTransport'), value: server.transportType },
    ];
    const info: McpDetailInfoRow[] = [];
    if (server.transportType === 'stdio' && server.command) {
      info.push({
        label: i18nService.t('mcpDetailCommand'),
        value: [server.command, ...(server.args ?? [])].join(' '),
        mono: true,
      });
    }
    if (server.url) {
      info.push({
        label: i18nService.t('mcpDetailUrl'),
        value: server.url,
        mono: true,
        onSelect: () => window.electron.shell.openExternal(server.url as string),
      });
    }
    const envKeys = getKeyListValue(server.env);
    if (envKeys) info.push({ label: i18nService.t('mcpDetailEnvKeys'), value: envKeys, mono: true });
    const headerKeys = getKeyListValue(server.headers);
    if (headerKeys) info.push({ label: i18nService.t('mcpDetailHeaders'), value: headerKeys, mono: true });
    if (launchStatusLabel) {
      info.push({
        label: i18nService.t('mcpDetailLaunch'),
        value: server.launchResolution?.error
          ? `${launchStatusLabel} · ${server.launchResolution.error}`
          : launchStatusLabel,
      });
    }
    info.push({ label: i18nService.t('mcpDetailId'), value: server.id, mono: true });

    return (
      <McpDetailModal
        title={server.name}
        description={getInstalledDescription(server)}
        stats={stats}
        info={info}
        onClose={closeDetail}
        footer={(
          <>
            {renderDetailToggle(server.enabled, () => handleToggleEnabled(server.id))}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { closeDetail(); handleOpenEditForm(server); }}
                className={DETAIL_FOOTER_BUTTON_CLASS}
              >
                <EditIcon className="h-4 w-4" />
                {i18nService.t('edit')}
              </button>
              <button
                type="button"
                onClick={() => { closeDetail(); handleRequestDelete(server); }}
                className={DETAIL_FOOTER_DESTRUCTIVE_CLASS}
              >
                <TrashIcon className="h-4 w-4" />
                {i18nService.t('delete')}
              </button>
            </div>
          </>
        )}
      />
    );
  };

  const renderRegistryGroupDetail = (item: RegistryGroupItem) => {
    const groupTransportType = getRegistryGroupTransportType(item);
    const groupEnabled = item.servers.some(server => server.enabled);
    const stats: McpDetailStat[] = [
      {
        label: i18nService.t('mcpDetailStatus'),
        value: i18nService.t(groupEnabled ? 'enabled' : 'disabled'),
      },
      ...(groupTransportType
        ? [{ label: i18nService.t('mcpDetailTransport'), value: groupTransportType }]
        : []),
      { label: i18nService.t('mcpDetailServers'), value: String(item.servers.length) },
    ];
    const info: McpDetailInfoRow[] = [];
    const groupSummary = getRegistryGroupSummary(item);
    if (groupSummary) {
      info.push({ label: i18nService.t('mcpDetailCommand'), value: groupSummary, mono: true });
    }
    info.push({
      label: i18nService.t('mcpDetailIncluded'),
      value: item.servers.map(server => server.name).join(', '),
    });
    info.push({ label: i18nService.t('mcpDetailId'), value: item.registryId, mono: true });

    return (
      <McpDetailModal
        title={item.registryId}
        description={getRegistryGroupDescription(item)}
        stats={stats}
        info={info}
        onClose={closeDetail}
        footer={(
          <>
            {renderDetailToggle(groupEnabled, () => handleToggleRegistryEnabled(
              item.registryId,
              item.servers,
            ))}
            <button
              type="button"
              onClick={() => {
                closeDetail();
                handleRequestDeleteRegistry(item.registryId, item.registryId, item.servers);
              }}
              className={DETAIL_FOOTER_DESTRUCTIVE_CLASS}
            >
              <TrashIcon className="h-4 w-4" />
              {i18nService.t('mcpUninstall')}
            </button>
          </>
        )}
      />
    );
  };

  /** The dialog reads live state by id, so toggling inside it stays in sync. */
  const renderDetailModal = () => {
    if (!detailTarget) return null;
    if (detailTarget.kind === 'server') {
      const server = servers.find(item => item.id === detailTarget.id);
      return server ? renderServerDetail(server) : null;
    }
    const group = installedItems.find(
      (item): item is RegistryGroupItem =>
        item.kind === 'registryGroup' && item.registryId === detailTarget.registryId,
    );
    return group ? renderRegistryGroupDetail(group) : null;
  };

  return (
    <div className="relative space-y-5">
      {actionError && (
        <ErrorMessage
          message={actionError}
          onClose={() => setActionError('')}
        />
      )}

      <div
        data-skin-management-toolbar="true"
        className="sticky top-0 z-10 space-y-4 bg-background pb-2"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative ml-auto w-full max-w-[300px] flex-1">
            <SearchIcon className="maties-input-icon-glyph h-4 w-4" />
            <input
              type="text"
              placeholder={i18nService.t('searchMcpServers')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="maties-input maties-input-icon pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  reportMcpAction('clear_search', {
                    source: 'mcp_manager',
                    searchKeywordLength: searchQuery.trim().length,
                    resultCount: filteredInstalled.length,
                  });
                  setSearchQuery('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#9aa1ab] transition-colors hover:text-[#1c1f23]"
              >
                <XCircleIconSolid className="h-4 w-4" />
              </button>
            )}
          </div>
          <Pill compact icon={<PlusCircleIcon className="h-4 w-4" />} onClick={handleOpenCreateForm}>
            {i18nService.t('mcpAddServer')}
          </Pill>
        </div>
      </div>

      <div>
        {filteredInstalled.length === 0 ? (
          searchQuery.trim() ? (
            <EmptyState sentence={i18nService.t('mcpNoInstalledServers')} />
          ) : (
            <EmptyState
              sentence={i18nService.t('connectorsEmptySentence')}
              action={(
                <Pill compact icon={<PlusCircleIcon className="h-3.5 w-3.5" />} onClick={handleOpenCreateForm}>
                  {i18nService.t('mcpAddServer')}
                </Pill>
              )}
            />
          )
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {filteredInstalled.map((item) => {
              if (item.kind === 'registryGroup') {
                const groupDescription = getRegistryGroupDescription(item);
                const groupTransportType = getRegistryGroupTransportType(item);
                const groupSummary = getRegistryGroupSummary(item);
                const groupEnabled = item.servers.some(server => server.enabled);
                return (
                  <McpCard
                    key={item.id}
                    title={item.registryId}
                    description={groupDescription}
                    onOpenDetail={() => openRegistryGroupDetail(item)}
                    actions={(
                      <>
                        <CardOverflowMenu
                          className={CARD_MENU_REVEAL_CLASS}
                          items={[{
                            key: 'uninstall',
                            label: i18nService.t('mcpUninstall'),
                            icon: <TrashIcon className="h-3.5 w-3.5" />,
                            destructive: true,
                            onSelect: () => handleRequestDeleteRegistry(
                              item.registryId,
                              item.registryId,
                              item.servers,
                            ),
                          }]}
                        />
                        <CardToggle
                          isOn={groupEnabled}
                          label={i18nService.t(groupEnabled ? 'disable' : 'enable')}
                          onToggle={() => handleToggleRegistryEnabled(item.registryId, item.servers)}
                        />
                      </>
                    )}
                    meta={(
                      <>
                        {groupTransportType && (
                          <span className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${TRANSPORT_BADGE_COLORS[groupTransportType] || ''}`}>
                            {groupTransportType}
                          </span>
                        )}
                        <span className="shrink-0 rounded bg-surface-raised px-1.5 py-0.5 font-medium">
                          {i18nService.t('mcpServersCount').replace('{count}', String(item.servers.length))}
                        </span>
                        {groupSummary && (
                          <>
                            <span className="shrink-0 text-secondary/50">·</span>
                            <span className="min-w-0 truncate">{groupSummary}</span>
                          </>
                        )}
                      </>
                    )}
                  />
                );
              }
              return renderServerCard(item.server);
            })}
          </div>
        )}
      </div>

      {renderDetailModal()}

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <Modal onClose={handleCancelDelete} overlayClassName="maties-backdrop fixed inset-0 z-50 flex items-center justify-center" className="maties-card-prose maties-in mx-4 w-full max-w-sm p-6">
          <div className="maties-row-title text-[15.5px]">
            {pendingDelete.kind === 'registryGroup'
              ? i18nService.t('mcpUninstall')
              : i18nService.t('deleteMcpServer')}
          </div>
          <p className="mt-2 text-sm text-secondary">
            {(pendingDelete.kind === 'registryGroup'
              ? i18nService.t('mcpRegistryDeleteConfirm')
              : i18nService.t('mcpDeleteConfirm')).replace('{name}', pendingDelete.name)}
          </p>
          {actionError && (
            <div className="mt-3 text-xs text-red-500">
              {actionError}
            </div>
          )}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelDelete}
              disabled={isDeleting}
              className="maties-pill-sm is-ghost"
            >
              {i18nService.t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="maties-pill-sm is-primary"
            >
              {i18nService.t('confirmDelete')}
            </button>
          </div>
        </Modal>
      )}

      {/* Add / edit form modal */}
      <McpServerFormModal
        isOpen={isFormOpen}
        server={editingServer}
        existingNames={existingNames}
        onClose={handleCloseForm}
        onSave={handleSaveForm}
        onImportJson={handleImportJsonServers}
      />
    </div>
  );
};

export default McpManager;
