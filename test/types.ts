// eslint-disable-next-line import/no-extraneous-dependencies
import BN from 'bn.js'

export type TrancheBalances = Record<string, { balance: BN; claimed?: boolean }>
