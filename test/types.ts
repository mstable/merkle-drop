import BN from 'bn.js'

export type TrancheBalances = Record<string, { balance: BN; claimed?: boolean }>
