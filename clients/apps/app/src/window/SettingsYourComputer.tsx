// Settings › Computer's second group, "Your Computer"
// (mac/Simeon/SettingsPages.swift's `YourComputerGroup`, and
// SettingsGeneral.swift's `GeneralSettingsModel` for its setting): how the
// agents may use this PC, "Execution on Local Computer", the choices above
// the team's ceiling greyed and the ceiling's line under it; and the
// commands allowed once, with Forget. In the Windows app only, where the
// agent's hands are (step 7f). The Mac's "Use hardware security keys" is
// left out: nothing on a PC answers it yet (the Mac has no signer either).

import { useEffect, useState } from 'react'
import {
  ceilingLine,
  isAboveCeiling,
  localToolChoices,
  localToolTitle,
  permissionLabel,
} from '../core/localToolPermission'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import {
  SettingsGroup,
  SettingsLine,
  SettingsMenu,
  SettingsPill,
} from './SettingsParts'
import { useWatched } from './useStore'

export function YourComputerGroup({ store }: { store: AppStore }) {
  useWatched(store)
  const [forgot, setForgot] = useState(false)
  // The page shown (`GeneralSettingsModel.load`): this account's setting and its team's ceiling read again.
  useEffect(() => {
    void store.loadLocalPermission()
  }, [store])
  const ceiling = store.localCeiling
  return (
    <SettingsGroup title={t('Your Computer')}>
      <SettingsMenu
        label={localToolTitle()}
        detail={ceiling ? ceilingLine(ceiling) : undefined}
        options={localToolChoices.map((value) => ({
          value,
          label: permissionLabel(value),
        }))}
        disabled={(value) => isAboveCeiling(value, ceiling)}
        value={store.localPermission}
        pending={store.localPermissionPending}
        pick={(value) => void store.setLocalPermission(value)}
      />
      <SettingsLine label={t('Commands Allowed Once')} divided>
        <SettingsPill
          title={forgot ? t('Forgotten') : t('Forget')}
          disabled={forgot}
          onClick={() =>
            void store.forgetCommandsAllowedOnce().then((done) => {
              if (done) setForgot(true)
            })
          }
        />
      </SettingsLine>
    </SettingsGroup>
  )
}
