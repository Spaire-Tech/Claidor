import React from 'react';

import { getPortalPricingUrl, PortalPricingKeyfrom } from '../../services/endpoints';
import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';
import Pill, { PillTone } from '../design/Pill';

export interface ConnectionPriceSheetProps {
  /** The service the person pressed Connect on, or null when the sheet is shut. */
  name: string | null;
  onClose: () => void;
}

/**
 * The price card (docs/maties/connectors.md, section 1): connections are part
 * of the paid plan. One sentence and one way forward, nothing else.
 */
const ConnectionPriceSheet: React.FC<ConnectionPriceSheetProps> = ({ name, onClose }) => {
  if (!name) return null;

  const handleSeePlans = () => {
    void window.electron.shell.openExternal(getPortalPricingUrl(PortalPricingKeyfrom.Connectors));
    onClose();
  };

  return (
    <Modal
      onClose={onClose}
      onEscape={onClose}
      overlayClassName="maties-backdrop fixed inset-0 z-50 flex items-center justify-center px-4"
      className="maties-card-prose maties-in w-full max-w-[420px] p-7"
    >
      <div role="dialog" aria-modal="true" aria-labelledby="maties-connection-price-title">
        <h2 id="maties-connection-price-title" className="maties-row-title text-[16.5px]">
          {i18nService.t('matiesConnectionsPriceTitle')}
        </h2>
        <p className="mt-2 text-[14px] leading-[1.5] text-[#6b7280]">
          {i18nService.t('matiesConnectionsPriceBody').replace('{name}', name)}
        </p>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Pill tone={PillTone.Ghost} compact onClick={onClose}>
            {i18nService.t('matiesConnectionsClose')}
          </Pill>
          <Pill tone={PillTone.Primary} compact onClick={handleSeePlans}>
            {i18nService.t('matiesConnectionsSeePlans')}
          </Pill>
        </div>
      </div>
    </Modal>
  );
};

export default ConnectionPriceSheet;
