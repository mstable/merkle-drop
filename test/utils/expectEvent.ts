import { BigNumber, ContractReceipt } from 'ethers'
import { expect } from 'chai'

const contains = (
  args: { [key: string]: unknown },
  key: keyof typeof args,
  value: unknown,
) => {
  expect(key in args).to.equal(true, `Event argument '${key}' not found`)

  if (value === null) {
    expect(args[key]).to.equal(
      null,
      `expected event argument '${key}' to be null but got ${args[key]}`,
    )
  } else if (BigNumber.isBigNumber(args[key]) || BigNumber.isBigNumber(value)) {
    const actual = BigNumber.isBigNumber(args[key])
      ? (args[key] as any).toString()
      : args[key]
    const expected = BigNumber.isBigNumber(value) ? value.toString() : value
    expect((args[key] as any).toString()).to.be.equal(
      expected,
      `expected event argument '${key}' to have value ${expected} but got ${actual}`,
    )
  } else {
    expect(args[key]).to.be.deep.equal(
      value,
      `expected event argument '${key}' to have value ${value} but got ${args[key]}`,
    )
  }
}

const inEvents = (
  events: ContractReceipt['events'],
  eventName: string,
  eventArgs = {},
) => {
  const matches = events?.filter((e) => e.event === eventName) ?? []

  expect(matches.length > 0).to.equal(true, `No '${eventName}' events found`)

  const exception: Error[] = []
  const event = matches.find(function (e) {
    for (const [k, v] of Object.entries(eventArgs)) {
      try {
        contains(e.args ?? {}, k, v)
      } catch (error) {
        exception.push(error)
        return false
      }
    }
    return true
  })

  if (event === undefined) {
    throw exception[0]
  }

  return event
}

export const expectEvent = <T>(
  receipt: ContractReceipt,
  eventName: string,
  args?: T,
) => {
  const events =
    receipt.events?.filter((event) => event.event === eventName) ?? []

  return inEvents(events, eventName, args)
}
