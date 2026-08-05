export interface RecommendationInput {
  product_type: 'saas' | 'ai' | 'marketplace' | 'agency' | 'consulting' | 'other'
  founder_location: 'us' | 'non_us'
  founder_state?: string
  planning_to_raise_vc: 'yes' | 'maybe' | 'no'
  number_of_founders: 'solo' | '2_5' | '6_plus'
  equity_plans: 'yes' | 'maybe' | 'no'
}

export interface RecommendationOutput {
  entity_type: 'LLC' | 'C_CORP'
  formation_state: string
  confidence: 'high' | 'medium'
  reasons: string[]
}

const TECH_PRODUCTS = ['saas', 'ai', 'marketplace'] as const

export function getRecommendation(
  input: RecommendationInput,
): RecommendationOutput {
  let score_llc = 0
  let score_c_corp = 0
  const reasons: string[] = []

  // Rule 1 — Venture capital intent (strongest signal)
  if (input.planning_to_raise_vc === 'yes') {
    score_c_corp += 5
    reasons.push('You indicated plans to raise venture capital')
  } else if (input.planning_to_raise_vc === 'maybe') {
    score_c_corp += 2
    reasons.push('You may raise venture capital in the future')
  }

  // Rule 2 — Technology startup signals
  if (TECH_PRODUCTS.includes(input.product_type as (typeof TECH_PRODUCTS)[number])) {
    score_c_corp += 2
    const label =
      input.product_type === 'saas'
        ? 'SaaS'
        : input.product_type === 'ai'
          ? 'AI'
          : 'marketplace'
    reasons.push(`You are building a ${label} product`)
  }

  // Rule 3 — Equity plans
  if (input.equity_plans === 'yes') {
    score_c_corp += 3
    reasons.push('You plan to issue equity (stock options, SAFEs)')
  } else if (input.equity_plans === 'maybe') {
    score_c_corp += 1
    reasons.push('You may issue equity to employees or investors')
  }

  // Rule 4 — Non-US founders (favors LLC + Wyoming if not raising VC)
  if (input.founder_location === 'non_us') {
    if (input.planning_to_raise_vc !== 'yes') {
      score_llc += 2
      reasons.push('Wyoming LLCs are commonly used by international founders')
    }
  }

  // Rule 5 — Bootstrapped founders
  if (input.planning_to_raise_vc === 'no' && input.equity_plans === 'no') {
    score_llc += 2
    reasons.push('LLCs offer simpler tax treatment for bootstrapped businesses')
  }

  // Rule 6 — Solo founder bootstrapping
  if (
    input.number_of_founders === 'solo' &&
    input.planning_to_raise_vc === 'no'
  ) {
    score_llc += 1
    reasons.push('Solo founders often prefer the simplicity of an LLC')
  }

  // Rule 7 — High-growth tech startup
  if (
    TECH_PRODUCTS.includes(input.product_type as (typeof TECH_PRODUCTS)[number]) &&
    input.equity_plans !== 'no'
  ) {
    score_c_corp += 2
  }

  // --- Final decision ---
  const entity_type = score_c_corp > score_llc ? 'C_CORP' : 'LLC'

  // State selection
  let formation_state: string
  if (entity_type === 'C_CORP') {
    formation_state = 'DE'
  } else if (input.founder_location === 'non_us') {
    formation_state = 'WY'
  } else if (input.founder_state) {
    formation_state = input.founder_state
    reasons.push(
      'Forming in your home state often simplifies tax compliance',
    )
  } else {
    formation_state = 'WY'
  }

  const scoreDiff = Math.abs(score_c_corp - score_llc)
  const confidence = scoreDiff >= 3 ? 'high' : 'medium'

  return { entity_type, formation_state, confidence, reasons }
}

export const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

export const US_STATES = Object.entries(US_STATE_NAMES).map(([code, name]) => ({
  code,
  name,
}))
