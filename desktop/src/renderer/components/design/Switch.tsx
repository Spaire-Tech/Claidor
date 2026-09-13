import React from 'react';

/**
 * The app's switch in the one blue (docs/maties/design.md, section 5).
 * 40 × 24 in a settings row; `small` (32 × 19) on a card.
 */
interface SwitchProps {
  checked: boolean;
  label: string;
  onChange: () => void | Promise<void>;
  disabled?: boolean;
  small?: boolean;
  title?: string;
  className?: string;
  /** Stop the click from reaching a clickable card behind the switch. */
  stopPropagation?: boolean;
}

const Switch: React.FC<SwitchProps> = ({
  checked,
  label,
  onChange,
  disabled = false,
  small = false,
  title,
  className,
  stopPropagation = false,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={title}
    disabled={disabled}
    onClick={(event) => {
      if (stopPropagation) event.stopPropagation();
      void onChange();
    }}
    className={`maties-switch ${small ? 'maties-switch-sm' : ''} ${className ?? ''}`.trim()}
  >
    <span />
  </button>
);

export default Switch;
