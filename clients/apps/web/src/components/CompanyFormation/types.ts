import { z } from 'zod'
import type { RecommendationOutput } from './recommendation'

export const founderIntentSchema = z
  .object({
    product_type: z.enum([
      'saas',
      'ai',
      'marketplace',
      'agency',
      'consulting',
      'other',
    ]),
    founder_location: z.enum(['us', 'non_us']),
    founder_state: z.string().length(2).optional(),
    planning_to_raise_vc: z.enum(['yes', 'maybe', 'no']),
    number_of_founders: z.enum(['solo', '2_5', '6_plus']),
    equity_plans: z.enum(['yes', 'maybe', 'no']),
  })
  .refine(
    (data) => data.founder_location !== 'us' || data.founder_state,
    { message: 'State is required for US founders', path: ['founder_state'] },
  )

export const companyDetailsSchema = z.object({
  legal_name: z.string().min(1, 'Company name is required').max(200),
  entity_type: z.enum(['LLC', 'C_CORP']),
  formation_state: z.string().min(2, 'Formation state is required'),
  founders: z
    .array(
      z.object({
        name: z.string().min(1, 'Name is required'),
        email: z.string().email('Valid email required'),
      }),
    )
    .min(1, 'At least one founder is required'),
})

export type FounderIntentData = z.input<typeof founderIntentSchema>

export type CompanyDetailsData = z.infer<typeof companyDetailsSchema>

export interface WizardFormData {
  // Step 1
  product_type: string
  founder_location: string
  founder_state?: string
  planning_to_raise_vc: string
  number_of_founders: string
  equity_plans: string
  // Step 2
  legal_name: string
  entity_type: 'LLC' | 'C_CORP'
  formation_state: string
  founders: Array<{ name: string; email: string }>
  // Derived
  recommendation: RecommendationOutput | null
}

export const INITIAL_WIZARD_DATA: WizardFormData = {
  product_type: '',
  founder_location: '',
  founder_state: undefined,
  planning_to_raise_vc: '',
  number_of_founders: '',
  equity_plans: '',
  legal_name: '',
  entity_type: 'C_CORP',
  formation_state: 'DE',
  founders: [{ name: '', email: '' }],
  recommendation: null,
}

export const DOOLA_AFFILIATE_URL = 'https://partnersps.doola.com/spaire'

export const STORAGE_KEY = 'spaire:formation-wizard-draft'
export const FORMATION_STARTED_KEY = 'spaire:formation-started'

export interface FormationStartedData {
  startedAt: string
  companyName: string
  entityType: string
  formationState: string
}
