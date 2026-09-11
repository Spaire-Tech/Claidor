import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { i18nService } from '../../services/i18n';
import { mcpService } from '../../services/mcp';
import { findMcpMarketplaceEntry } from '../../services/mcpMarketplaceEntry';
import type { RootState } from '../../store';
import { setMcpServers } from '../../store/slices/mcpSlice';
import type { McpRegistryEntry, McpServerFormData } from '../../types/mcp';
import Modal from '../common/Modal';
import Pill, { PillTone } from '../design/Pill';
import { getFormAnalyticsParams, getRegistryAnalyticsParams, reportMcpAction } from './analytics';
import McpServerFormModal from './McpServerFormModal';

const ANALYTICS_SOURCE = 'connections_catalog';

export interface McpRegistryInstallModalProps {
  /** Id of the catalogue entry to install; null keeps the modal closed. */
  entryId: string | null;
  onClose: () => void;
}

/**
 * The install form of the Connectors page for one entry of Claidor's MCP
 * catalogue, opened by id: the same `McpServerFormModal` the manager uses,
 * without the manager around it. The entry comes from the cached
 * marketplace, or from a fetch when there is no cache yet.
 */
const McpRegistryInstallModal: React.FC<McpRegistryInstallModalProps> = ({ entryId, onClose }) => {
  const dispatch = useDispatch();
  const servers = useSelector((state: RootState) => state.mcp.servers);
  const existingNames = useMemo(() => servers.map((server) => server.name), [servers]);
  const [entry, setEntry] = useState<McpRegistryEntry | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEntry(null);
    setMissing(false);
    setError('');
    if (!entryId) return undefined;
    let active = true;
    void findMcpMarketplaceEntry(entryId).then((found) => {
      if (!active) return;
      if (found) {
        reportMcpAction('marketplace_install_open', { source: ANALYTICS_SOURCE, ...getRegistryAnalyticsParams(found) });
        setEntry(found);
      } else {
        setMissing(true);
      }
    });
    return () => { active = false; };
  }, [entryId]);

  const handleSave = async (data: McpServerFormData) => {
    setError('');
    reportMcpAction('create_submit', { source: ANALYTICS_SOURCE, ...getFormAnalyticsParams(data, entry) });
    const result = await mcpService.createServer(data);
    if (!result.success) {
      setError(result.error || i18nService.t('mcpCreateFailed'));
      reportMcpAction('create_failed', {
        source: ANALYTICS_SOURCE,
        result: 'failed',
        errorCode: 'create_failed',
        ...getFormAnalyticsParams(data, entry),
      });
      return;
    }
    if (result.servers) dispatch(setMcpServers(result.servers));
    reportMcpAction('create_success', { source: ANALYTICS_SOURCE, result: 'success', ...getFormAnalyticsParams(data, entry) });
    onClose();
  };

  if (!entryId) return null;

  if (missing || error) {
    return (
      <Modal
        onClose={onClose}
        onEscape={onClose}
        overlayClassName="maties-backdrop fixed inset-0 z-50 flex items-center justify-center px-4"
        className="maties-card-prose maties-in w-full max-w-[420px] p-7"
      >
        <p className="text-[14.5px] leading-[1.5] text-[#1c1f23]">
          {error || i18nService.t('matiesConnectionsMcpEntryMissing')}
        </p>
        <div className="mt-6 flex justify-end">
          <Pill tone={PillTone.Ghost} compact onClick={onClose}>
            {i18nService.t('matiesConnectionsClose')}
          </Pill>
        </div>
      </Modal>
    );
  }

  return (
    <McpServerFormModal
      isOpen={entry !== null}
      server={null}
      registryEntry={entry}
      existingNames={existingNames}
      onClose={onClose}
      onSave={(data) => { void handleSave(data); }}
    />
  );
};

export default McpRegistryInstallModal;
