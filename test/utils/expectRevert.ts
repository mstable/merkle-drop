import { expect } from 'chai'

const expectException = async <T>(
  promise: Promise<T>,
  expectedError: string,
) => {
  try {
    await promise
  } catch (error) {
    if ((error as Error).message.indexOf(expectedError) === -1) {
      // When the exception was a revert, the resulting string will include only
      // the revert reason, otherwise it will be the type of exception (e.g. 'invalid opcode')
      const actualError = (error as Error).message.replace(
        /(Returned error|Error): VM Exception while processing transaction: (revert )?/,
        '',
      )
      expect(actualError).to.equal(
        expectedError,
        'Wrong kind of exception received',
      )
    }
    return
  }

  expect.fail('Expected an exception but none was received')
}

const expectRevert = async <T>(promise: Promise<T>, expectedError: string) => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  promise.catch(() => {}) // Avoids uncaught promise rejections in case an input validation causes us to return early

  if (!expectedError) {
    throw Error(
      "No revert reason specified: call expectRevert with the reason string, or use expectRevert.unspecified \
if your 'require' statement doesn't have one.",
    )
  }

  await expectException(promise, expectedError)
}

expectRevert.assertion = (promise: Promise<any>) =>
  expectException(promise, 'invalid opcode')

expectRevert.outOfGas = (promise: Promise<any>) =>
  expectException(promise, 'out of gas')

expectRevert.unspecified = (promise: Promise<any>) =>
  expectException(promise, 'revert')

export { expectRevert }
