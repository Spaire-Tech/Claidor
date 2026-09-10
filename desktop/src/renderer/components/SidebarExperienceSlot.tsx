import React, { useLayoutEffect } from 'react';

interface SidebarExperienceSlotProps {
  hidden?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}

/**
 * The sidebar's promotional slot. The design (docs/maties/design.md,
 * section 3) has no place for banners in the sidebar, so the slot mounts
 * nothing: `SidebarAdBanner` and its carousel are no longer rendered. The
 * component keeps its contract so `Sidebar` needs no change; it always
 * reports itself as not visible.
 */
const SidebarExperienceSlot: React.FC<SidebarExperienceSlotProps> = ({ onVisibleChange }) => {
  useLayoutEffect(() => {
    onVisibleChange?.(false);
    return () => onVisibleChange?.(false);
  }, [onVisibleChange]);

  return null;
};

export default SidebarExperienceSlot;
