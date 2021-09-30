import { BigNumber, BigNumberish } from 'ethers'

export const simpleToExactAmount = (
  amount: BigNumberish,
  decimals: number | BigNumber = 18,
): BigNumber => {
  // Code is largely lifted from the guts of web3 toWei here:
  // https://github.com/ethjs/ethjs-unit/blob/master/src/index.js
  let amountString = amount.toString()
  const decimalsBN = BigNumber.from(decimals)

  if (decimalsBN.gt(BigNumber.from(100))) {
    throw new Error(`Invalid decimals amount`)
  }

  const scale = BigNumber.from(10).pow(BigNumber.from(decimals))
  const scaleString = scale.toString()

  // Is it negative?
  const negative = amountString.substring(0, 1) === '-'
  if (negative) {
    amountString = amountString.substring(1)
  }

  if (amountString === '.') {
    throw new Error(
      `Error converting number ${amountString} to precise unit, invalid value`,
    )
  }

  // Split it into a whole and fractional part
  // eslint-disable-next-line prefer-const
  let [whole, fraction, ...rest] = amountString.split('.')
  if (rest.length > 0) {
    throw new Error(
      `Error converting number ${amountString} to precise unit, too many decimal points`,
    )
  }

  if (!whole) {
    whole = '0'
  }
  if (!fraction) {
    fraction = '0'
  }

  if (fraction.length > scaleString.length - 1) {
    throw new Error(
      `Error converting number ${amountString} to precise unit, too many decimal places`,
    )
  }

  while (fraction.length < scaleString.length - 1) {
    fraction += '0'
  }

  const wholeBN = BigNumber.from(whole)
  const fractionBN = BigNumber.from(fraction)
  let result = wholeBN.mul(scale).add(fractionBN)

  if (negative) {
    result = result.mul(BigNumber.from('-1'))
  }

  return result
}
