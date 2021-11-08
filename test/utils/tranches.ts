import { AccountBalancesTuple, TrancheBalances } from '../types'
import { simpleToExactAmount } from './math'

export const getTranche = (
  ...accountBalances: AccountBalancesTuple
): TrancheBalances =>
  accountBalances.reduce<TrancheBalances>(
    (prev, [account, balance, claimed]) => ({
      ...prev,
      [account]: { balance: simpleToExactAmount(balance), claimed },
    }),
    {},
  )
