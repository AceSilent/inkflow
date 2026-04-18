export function getModelContextWindow(model: string): number {
  if (/\[1m\]/i.test(model)) return 1_000_000
  if (/claude-opus-4\.\d.*1m/i.test(model)) return 1_000_000
  if (/glm-5\.\d/i.test(model)) return 1_000_000
  if (/deepseek-v3\.\d/i.test(model)) return 200_000
  if (/claude-opus|claude-sonnet/i.test(model)) return 200_000
  return 200_000
}

export type BudgetTierName = 'green' | 'yellow' | 'orange' | 'red'
export type BudgetAction = 'none' | 'decay_tool_results' | 'decay_and_cold_compact' | 'force_compact_and_warn'

export interface BudgetTier {
  name: BudgetTierName
  ratio: number
  action: BudgetAction
}

export const BUDGET_TIERS: BudgetTier[] = [
  { name: 'green',  ratio: 0.30, action: 'none' },
  { name: 'yellow', ratio: 0.60, action: 'decay_tool_results' },
  { name: 'orange', ratio: 0.80, action: 'decay_and_cold_compact' },
  { name: 'red',    ratio: 1.00, action: 'force_compact_and_warn' },
]

export interface BudgetTierResult {
  name: BudgetTierName
  action: BudgetAction
  ratio: number
  tokensUsed: number
  windowSize: number
}

export function evaluateBudgetTier(tokensUsed: number, windowSize: number): BudgetTierResult {
  const ratio = tokensUsed / windowSize
  let match = BUDGET_TIERS[0]
  for (const tier of BUDGET_TIERS) {
    if (ratio <= tier.ratio) { match = tier; break }
    match = tier  // fall through to highest matching
  }
  return { name: match.name, action: match.action, ratio, tokensUsed, windowSize }
}
