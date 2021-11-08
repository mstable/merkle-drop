import fs from 'fs/promises'
import fetch from 'node-fetch'
import { BigNumber, utils } from 'ethers'
import { CLIArgumentType } from 'hardhat/src/types/index'
import { isValidAddress } from 'ethereumjs-util'
import { HardhatError } from 'hardhat/internal/core/errors'
import { ERRORS } from 'hardhat/internal/core/errors-list'

type Balances = Record<string, string>

type BalancesBN = Record<string, BigNumber>

export interface JSONBalances {
  body: string
  json: Balances
  parsed: BalancesBN
}

export const addressType: CLIArgumentType<string> = {
  name: 'address',
  parse: (argName, strValue) => strValue,
  validate: (argName: string, value: unknown): void => {
    const isValid = typeof value === 'string' && isValidAddress(value)

    if (!isValid) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE, {
        value,
        name: argName,
        type: addressType.name,
      })
    }
  },
}

const parseJSONBalances = async (uri: string): Promise<JSONBalances> => {
  let body: string

  if (uri.startsWith('http')) {
    const resp = await fetch(uri)
    const buffer = await resp.buffer()
    body = buffer.toString()
  } else {
    body = await fs.readFile(uri, 'utf8')
  }

  const json = JSON.parse(body) as Balances

  const parsed = Object.fromEntries(
    Object.entries(json).map(([account, balance]) => [
      account,
      BigNumber.from(balance),
    ]),
  )

  return { body, json, parsed }
}

export const jsonBalancesType: CLIArgumentType<Promise<JSONBalances>> = {
  name: 'JSON address => balance mapping',
  parse: async (argName, strValue) => parseJSONBalances(strValue),
  validate: async (
    argName: string,
    balancesPromise: Promise<JSONBalances>,
  ): Promise<void> => {
    const balances = await balancesPromise

    const isValid = Object.entries(balances.parsed).every(
      ([address, balance]) => isValidAddress(address) && balance.gte(0),
    )

    if (!isValid) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE, {
        value: balances.json,
        name: argName,
        type: jsonBalancesType.name,
      })
    }
  },
}

export const addressArrType: CLIArgumentType<string[]> = {
  name: 'address[]',
  parse: (argName, strValue) => strValue.split(','),
  validate: (argName: string, value: unknown): void => {
    const isValid = Array.isArray(value) && value.every(isValidAddress)

    if (!isValid) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE, {
        value,
        name: argName,
        type: addressArrType.name,
      })
    }
  },
}
