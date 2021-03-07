import { BigNumber } from 'ethers'

export interface TrancheBalances {
  [account: string]: { balance: BigNumber; claimed?: boolean }
}

// [account, balance] | [account, balance, claimed]
export type AccountBalancesTuple = (
  | [string, string]
  | [string, string, boolean]
)[]
