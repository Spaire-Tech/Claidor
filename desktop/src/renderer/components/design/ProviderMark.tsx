import React from 'react';
import { useSelector } from 'react-redux';

import { getProviderIcon } from '../../providers/uiRegistry';
import type { RootState } from '../../store';
import type { Model } from '../../store/slices/modelSlice';
import { resolveModelIconProviderKey, resolveProviderKeyForModelRef } from '../../utils/modelProviderHint';
import { matchesOpenClawModelRef } from '../../utils/openclawModelRef';

/**
 * The model's logo, wherever the model is named (docs/maties/design.md,
 * section 2). Given a model reference as a turn stores it, finds the
 * provider mark the app already has and draws it at `size`.
 */
const ProviderMark: React.FC<{ modelRef: string; size?: number; className?: string }> = ({
  modelRef,
  size = 14,
  className,
}) => {
  const models = useSelector((state: RootState) => state.model.availableModels as Model[]);
  const record = models.find((model) => matchesOpenClawModelRef(modelRef, model));
  const providerKey = record ? resolveModelIconProviderKey(record) : resolveProviderKeyForModelRef(modelRef);
  const icon = getProviderIcon(providerKey);
  const sized = React.isValidElement<{ className?: string; style?: React.CSSProperties }>(icon)
    ? React.cloneElement(icon, {
        className: `${icon.props.className ?? ''} shrink-0`.trim(),
        style: { ...icon.props.style, width: size, height: size },
      })
    : icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className ?? ''}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {sized}
    </span>
  );
};

export default ProviderMark;
