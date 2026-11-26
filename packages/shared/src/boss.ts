export type InvestorTeam = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

export type InfluenceCard =
  | { kind: 'team'; team: InvestorTeam }
  | { kind: 'travel'; team: InvestorTeam | 'any' }
  | { kind: 'recruit' | 'boss' | 'stop' }

/** Each participating team counts once, whether provided by a placard or a card. */
export interface DealSpace {
  required: InvestorTeam[]
  optional: InvestorTeam[]
  teamCount: number
  dividends: number
}
