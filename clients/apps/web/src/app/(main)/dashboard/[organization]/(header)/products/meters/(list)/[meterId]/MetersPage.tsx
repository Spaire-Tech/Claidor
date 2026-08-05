'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { MeterPage } from '@/components/Meter/MeterPage'
import { useModal } from '@/components/Modal/useModal'
import { schemas } from '@spaire/client'
import React from 'react'

interface ClientPageProps {
  organization: schemas['Organization']
  meter: schemas['Meter']
}

const ClientPage: React.FC<ClientPageProps> = ({ organization, meter }) => {
  const {
    isShown: isEditMeterModalShown,
    show: showEditMeterModal,
    hide: hideEditMeterModal,
  } = useModal()

  return (
    <DashboardBody>
      <MeterPage
        meter={meter}
        organization={organization}
        isEditMeterModalShown={isEditMeterModalShown}
        hideEditMeterModal={hideEditMeterModal}
      />
    </DashboardBody>
  )
}

export default ClientPage
