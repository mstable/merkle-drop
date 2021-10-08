import fs from 'fs/promises'
import { BigNumber, utils } from 'ethers'
import { CLIArgumentType } from 'hardhat/src/types/index'
import { isValidAddress } from 'ethereumjs-util'
import { HardhatError } from 'hardhat/internal/core/errors'
import { ERRORS } from 'hardhat/internal/core/errors-list'

type Balances = Record<string, string>

type BalancesBN = Record<string, { balance: BigNumber }>

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

const parseJsonMapping = async (filePath: string): Promise<Balances> => {
  const body = await fs.readFile(filePath, 'utf8')
  return JSON.parse(body)
}

export const jsonBalancesType: CLIArgumentType<Promise<BalancesBN>> = {
  name: 'JSON address => balance mapping',
  parse: async (argName, strValue) => {
    const mapping = await parseJsonMapping(strValue)
    return Object.keys(mapping).reduce(
      (prev, address) => ({
        ...prev,
        [address]: { balance: utils.parseUnits(mapping[address]) },
      }),
      {},
    )
  },
  validate: async (
    argName: string,
    balancesPromise: Promise<BalancesBN>,
  ): Promise<void> => {
    const balances = await balancesPromise

    const isValid = Object.entries(balances).every(
      ([address, { balance }]) => isValidAddress(address) && balance.gte(0),
    )

    if (!isValid) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE, {
        value: balances,
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
