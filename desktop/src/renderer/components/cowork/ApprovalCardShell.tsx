import '../design/conversation.css';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { APPROVAL_SLOT_TURN, markApprovalSlotOccupied, useApprovalSlot } from '../design/approvalSlots';

/**
 * Where an approval card sits (docs/maties/design.md, « Approval »): in the
 * running step's result-card slot when that step is on screen, else at the
 * end of the streaming turn, else — with no conversation on screen at all —
 * floating above the composer. Never a dimmed page.
 *
 * The permission request itself is owned by `App.tsx`, which mounts this
 * component at the top of the tree; the portal is what lets the same
 * component, with the same `onRespond`, appear inside the turn.
 */
const ApprovalCardShell: React.FC<{
  slotKeys: Array<string | null | undefined>;
  hidden?: boolean;
  children: React.ReactNode;
}> = ({ slotKeys, hidden = false, children }) => {
  const keys = [...slotKeys, APPROVAL_SLOT_TURN];
  const slot = useApprovalSlot(keys);
  const slotKey = slot?.dataset.matiesApprovalSlot ?? null;

  useEffect(() => {
    if (!slotKey || hidden) return undefined;
    markApprovalSlotOccupied(slotKey, true);
    return () => markApprovalSlotOccupied(slotKey, false);
  }, [slotKey, hidden]);

  if (slot) {
    return createPortal(
      <div hidden={hidden} className="maties-in-slow" style={{ maxWidth: 640 }}>
        {children}
      </div>,
      slot,
    );
  }

  return (
    <div
      hidden={hidden}
      className="maties-in fixed z-50"
      style={{
        left: '50%',
        bottom: 132,
        transform: 'translateX(-50%)',
        width: 'min(640px, calc(100vw - 32px))',
      }}
      role="dialog"
      aria-modal={false}
    >
      {children}
    </div>
  );
};

export default ApprovalCardShell;
