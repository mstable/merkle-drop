import { expectEvent, expectRevert } from '@openzeppelin/test-helpers'
import BN from 'bn.js'

import { MerkleDropInstance, TTokenInstance } from '../types/generated'
import { TrancheBalances } from './types'
import {
  createTreeWithAccounts,
  getAccountBalanceProof,
  MerkleTree,
} from './utils/merkleTree'
import { simpleToExactAmount } from './utils/math'

const MerkleDrop = artifacts.require('MerkleDrop')
const TToken = artifacts.require('TToken')

const DECIMALS = 18

// [account, balance] | [account, balance, claimed]
type AccountBalancesTuple = ([string, string] | [string, string, boolean])[]

const exactAmount = (simpleAmount: number | string): BN =>
  simpleToExactAmount(simpleAmount, DECIMALS)

const getTranche = (
  ...accountBalances: AccountBalancesTuple
): TrancheBalances => {
  return accountBalances.reduce<TrancheBalances>(
    (prev, [account, balance, claimed]) => ({
      ...prev,
      [account]: { balance: exactAmount(balance), claimed },
    }),
    {},
  )
}

contract('MerkleDrop', accounts => {
  let token: TTokenInstance
  let merkleDrop: MerkleDropInstance

  const [
    funder,
    claimantAcct,
    acctWithNoClaim,
    otherAcct1,
    otherAcct2,
    otherAcct3,
  ] = accounts

  const TRANCHES = {
    unclaimed: getTranche(
      [claimantAcct, '100'],
      [otherAcct1, '25'],
      [otherAcct2, '75'],
      [otherAcct3, '3000'],
    ),
    claimed: getTranche(
      [claimantAcct, '100', true],
      [otherAcct1, '1'],
      [otherAcct3, '3000'],
    ),
    noBalance: getTranche(
      [claimantAcct, '0'],
      [otherAcct1, '10000'],
      [otherAcct2, '1'],
      [otherAcct3, '10000'],
    ),
  }

  beforeEach(async () => {
    // Deploy TToken
    token = await TToken.new('TToken', 'TKN', DECIMALS)

    // Deploy MerkleDrop
    merkleDrop = await MerkleDrop.new()

    // Initialize MerkleDrop
    await merkleDrop.initialize(funder, [funder], token.address)

    // Mint TToken (large amount)
    const amount = exactAmount('100000000')
    await token.mint(funder, amount)
  })

  const setup = async (
    ...tranches: TrancheBalances[]
  ): Promise<{
    tranche: string
    tree: MerkleTree
    balances: TrancheBalances
    totalAmount: BN
  }[]> => {
    // Approval cumulative amount
    const cumulativeAmount = tranches.reduce(
      (prev, balances) =>
        prev.add(
          Object.values(balances).reduce(
            (trancheAmount, { balance }) => trancheAmount.add(balance),
            new BN(0),
          ),
        ),
      new BN(0),
    )
    await token.approve(merkleDrop.address, cumulativeAmount)

    // Add tranches
    return Promise.all(
      tranches.map(async (balances, index) => {
        const tranche = index.toString()

        const tree = createTreeWithAccounts(balances)
        const merkleRoot = tree.hexRoot

        const totalAmount = Object.values(balances).reduce(
          (prev, current) => prev.add(current.balance),
          new BN(0),
        )

        const seedTx = await merkleDrop.seedNewAllocations(
          merkleRoot,
          totalAmount,
        )

        expectEvent(seedTx, 'TrancheAdded', {
          tranche,
          merkleRoot,
          totalAmount,
        })

        // Perform claims
        const claims = Object.entries(balances)
          .filter(([, value]) => value.claimed)
          .map(([account, { balance }]) => {
            const proof = getAccountBalanceProof(tree, account, balance)
            return merkleDrop.claimWeek(account, tranche, balance, proof)
          })
        await Promise.all(claims)

        return { tranche, tree, balances, totalAmount }
      }),
    )
  }

  describe('verifyClaim', () => {
    it('proofs for expired tranches are not verified', async () => {
      const tranches = await setup(TRANCHES.unclaimed)

      const balance = exactAmount('100')

      const proof = getAccountBalanceProof(
        tranches[0].tree,
        claimantAcct,
        balance,
      )

      const verifiedBeforeExpiration = await merkleDrop.verifyClaim(
        claimantAcct,
        tranches[0].tranche,
        balance,
        proof,
      )

      expect(verifiedBeforeExpiration).eq(
        true,
        'Proof should be verified for non-expired tranche',
      )

      const expireTx = await merkleDrop.expireTranche(tranches[0].tranche)

      expectEvent(expireTx, 'TrancheExpired', { tranche: tranches[0].tranche })

      const verifiedAfterExpiration = await merkleDrop.verifyClaim(
        claimantAcct,
        tranches[0].tranche,
        balance,
        proof,
      )

      expect(verifiedAfterExpiration).eq(
        false,
        'Proof should NOT be verified for expired tranche',
      )
    })
  })

  describe('claimWeek', () => {
    it('invalid liquidityProvider does not get claimed', async () => {
      const [{ tranche }] = await setup(
        // Just acct1, not acct2
        TRANCHES.unclaimed,
      )

      const balance = exactAmount('100')

      const treeWithAcct2 = createTreeWithAccounts({
        [acctWithNoClaim]: { balance },
      })
      const proof = getAccountBalanceProof(
        treeWithAcct2,
        acctWithNoClaim,
        balance,
      )

      const claimPromise = merkleDrop.claimWeek(
        acctWithNoClaim,
        tranche,
        balance,
        proof,
      )

      await expectRevert(claimPromise, 'Incorrect merkle proof')
    })

    it('invalid balance does not get claimed', async () => {
      const [{ tranche }] = await setup(TRANCHES.unclaimed)

      // Over the balance acct1 should be able to claim
      const balance = exactAmount('1000')

      const treeWithHigherBalance = createTreeWithAccounts({
        [claimantAcct]: { balance },
      })
      const proof = getAccountBalanceProof(
        treeWithHigherBalance,
        claimantAcct,
        balance,
      )

      const claimPromise = merkleDrop.claimWeek(
        claimantAcct,
        tranche,
        balance,
        proof,
      )

      await expectRevert(claimPromise, 'Incorrect merkle proof')
    })

    it('future tranche does not get claimed', async () => {
      const [
        {
          tree,
          balances: {
            [claimantAcct]: { balance },
          },
        },
      ] = await setup(
        // Only tranche 0
        TRANCHES.unclaimed,
      )

      const proof = getAccountBalanceProof(tree, claimantAcct, balance)

      const claimPromise = merkleDrop.claimWeek(
        claimantAcct,
        1, // Tranche 1 should not exist yet
        balance,
        proof,
      )

      await expectRevert(claimPromise, 'Week cannot be in the future')
    })

    it('LP cannot claim the same tranche more than once', async () => {
      const [
        {
          tree,
          tranche,
          balances: {
            [claimantAcct]: { balance },
          },
        },
      ] = await setup(TRANCHES.claimed)

      const proof = getAccountBalanceProof(tree, claimantAcct, balance)

      const claimPromise = merkleDrop.claimWeek(
        claimantAcct,
        tranche,
        balance,
        proof,
      )

      await expectRevert(claimPromise, 'LP has already claimed')
    })

    it('LP cannot claim balance of 0', async () => {
      const [
        {
          tree,
          tranche,
          balances: {
            [claimantAcct]: { balance },
          },
        },
      ] = await setup(TRANCHES.noBalance)

      const proof = getAccountBalanceProof(tree, claimantAcct, balance)

      const claimPromise = merkleDrop.claimWeek(
        claimantAcct,
        tranche,
        balance,
        proof,
      )

      await expectRevert(
        claimPromise,
        'No balance would be transferred - not going to waste your gas',
      )
    })

    it('valid claim is claimed', async () => {
      const [
        {
          tree,
          tranche,
          balances: {
            [claimantAcct]: { balance },
          },
        },
      ] = await setup(TRANCHES.unclaimed)

      const proof = getAccountBalanceProof(tree, claimantAcct, balance)

      const claimTx = await merkleDrop.claimWeek(
        claimantAcct,
        tranche,
        balance,
        proof,
      )

      expectEvent(claimTx, 'Claimed', {
        claimant: claimantAcct,
        week: tranche,
        balance,
      })
    })

    it('valid claims can be made on behalf of others', async () => {
      const [
        {
          tree,
          tranche,
          balances: {
            [claimantAcct]: { balance },
          },
        },
      ] = await setup(TRANCHES.unclaimed)

      const proof = getAccountBalanceProof(tree, claimantAcct, balance)

      const claimTx = await merkleDrop.claimWeek(
        claimantAcct,
        tranche,
        balance,
        proof,
        {
          from: acctWithNoClaim,
        },
      )

      expectEvent(claimTx, 'Claimed', {
        claimant: claimantAcct,
        week: tranche,
        balance,
      })
    })
  })

  describe('claimWeeks', () => {
    it('invalid liquidityProvider does not get claimed', async () => {
      const [{ tranche: tranche1 }, { tranche: tranche2 }] = await setup(
        // Just acct1, not acct2
        TRANCHES.unclaimed,
        TRANCHES.unclaimed,
      )

      const balances = [exactAmount('100'), exactAmount('100')]

      const tree1 = createTreeWithAccounts({
        [acctWithNoClaim]: { balance: balances[0] },
      })
      const tree2 = createTreeWithAccounts({
        [acctWithNoClaim]: { balance: balances[1] },
      })

      const proof1 = getAccountBalanceProof(tree1, acctWithNoClaim, balances[0])
      const proof2 = getAccountBalanceProof(tree2, acctWithNoClaim, balances[0])

      const claimPromise = merkleDrop.claimWeeks(
        acctWithNoClaim,
        [tranche1, tranche2],
        balances,
        [proof1, proof2],
      )

      await expectRevert(claimPromise, 'Incorrect merkle proof')
    })

    it('invalid balances do not get claimed', async () => {
      const [{ tranche: tranche1 }, { tranche: tranche2 }] = await setup(
        TRANCHES.unclaimed,
        TRANCHES.unclaimed,
      )

      // Over the balances acct1 should be able to claim
      const balances = [exactAmount('1000'), exactAmount('1000')]

      const tree1 = createTreeWithAccounts({
        [claimantAcct]: { balance: balances[0] },
      })
      const tree2 = createTreeWithAccounts({
        [claimantAcct]: { balance: balances[1] },
      })

      const proof1 = getAccountBalanceProof(tree1, claimantAcct, balances[0])
      const proof2 = getAccountBalanceProof(tree2, claimantAcct, balances[0])

      const claimPromise = merkleDrop.claimWeeks(
        claimantAcct,
        [tranche1, tranche2],
        balances,
        [proof1, proof2],
      )

      await expectRevert(claimPromise, 'Incorrect merkle proof')
    })

    it('future tranches do not get claimed', async () => {
      const [
        {
          tree: tree1,
          balances: {
            [claimantAcct]: { balance: balance1 },
          },
        },
        {
          tree: tree2,
          balances: {
            [claimantAcct]: { balance: balance2 },
          },
        },
      ] = await setup(TRANCHES.unclaimed, TRANCHES.unclaimed)

      const balances = [balance1, balance2]

      const proof1 = getAccountBalanceProof(tree1, claimantAcct, balance1)
      const proof2 = getAccountBalanceProof(tree2, claimantAcct, balance2)
      const proofs = [proof1, proof2]

      const claimPromise = merkleDrop.claimWeeks(
        claimantAcct,
        [1, 2], // Tranche 1 exists, but tranche 2 doesn't exist yet)
        balances,
        proofs,
      )

      await expectRevert(claimPromise, 'Week cannot be in the future')
    })

    it('LP cannot claim the same tranches more than once', async () => {
      const [
        {
          tranche: tranche1,
          tree: tree1,
          balances: {
            [claimantAcct]: { balance: balance1 },
          },
        },
        {
          tranche: tranche2,
          tree: tree2,
          balances: {
            [claimantAcct]: { balance: balance2 },
          },
        },
      ] = await setup(
        TRANCHES.claimed, // claimed
        TRANCHES.unclaimed, // not claimed
      )

      const balances = [balance1, balance2]

      const proof1 = getAccountBalanceProof(tree1, claimantAcct, balance1)
      const proof2 = getAccountBalanceProof(tree2, claimantAcct, balance2)
      const proofs = [proof1, proof2]

      const tranches = [tranche1, tranche2]

      const claimPromise = merkleDrop.claimWeeks(
        claimantAcct,
        tranches,
        balances,
        proofs,
      )

      await expectRevert(claimPromise, 'LP has already claimed')
    })

    it('tranches, balances and proofs must match', async () => {
      const [
        {
          tranche: tranche1,
          tree: tree1,
          balances: {
            [claimantAcct]: { balance: balance1 },
          },
        },
        {
          tranche: tranche2,
          tree: tree2,
          balances: {
            [claimantAcct]: { balance: balance2 },
          },
        },
      ] = await setup(TRANCHES.unclaimed, TRANCHES.unclaimed)

      const balances = [balance1, balance2]

      const proof1 = getAccountBalanceProof(tree1, claimantAcct, balance1)
      const proof2 = getAccountBalanceProof(tree2, claimantAcct, balance2)
      const proofs = [proof1, proof2]

      const tranches = [tranche1, tranche2]

      await expectRevert(
        merkleDrop.claimWeeks(
          claimantAcct,
          [], // No tranches
          balances,
          proofs,
        ),
        'Mismatching inputs',
      )

      await expectRevert(
        merkleDrop.claimWeeks(
          claimantAcct,
          [tranches[0]], // One tranche
          balances,
          proofs,
        ),
        'Mismatching inputs',
      )

      await expectRevert(
        merkleDrop.claimWeeks(
          claimantAcct,
          [0, 1, 2], // Extra tranche
          balances,
          proofs,
        ),
        'Mismatching inputs',
      )

      await expectRevert(
        merkleDrop.claimWeeks(
          claimantAcct,
          tranches,
          [], // no balances
          proofs,
        ),
        'Mismatching inputs',
      )

      await expectRevert(
        merkleDrop.claimWeeks(
          claimantAcct,
          tranches,
          [balances[0]], // one balance
          proofs,
        ),
        'Mismatching inputs',
      )

      await expectRevert(
        merkleDrop.claimWeeks(
          claimantAcct,
          tranches,
          [...balances, exactAmount('100')], // extra balance
          proofs,
        ),
        'Mismatching inputs',
      )

      await expectRevert(
        merkleDrop.claimWeeks(
          claimantAcct,
          tranches,
          balances,
          [], // no proofs
        ),
        'Mismatching inputs',
      )

      await expectRevert(
        merkleDrop.claimWeeks(
          claimantAcct,
          tranches,
          balances,
          [proofs[0]], // one proof
        ),
        'Mismatching inputs',
      )

      await expectRevert(
        merkleDrop.claimWeeks(
          claimantAcct,
          tranches,
          balances,
          [...proofs, proofs[0]], // extra proof
        ),
        'Mismatching inputs',
      )
    })

    it('valid claims are claimed', async () => {
      const [
        {
          tranche: tranche1,
          tree: tree1,
          balances: {
            [claimantAcct]: { balance: balance1 },
          },
        },
        {
          tranche: tranche2,
          tree: tree2,
          balances: {
            [claimantAcct]: { balance: balance2 },
          },
        },
      ] = await setup(TRANCHES.unclaimed, TRANCHES.unclaimed)

      const balances = [balance1, balance2]

      const proof1 = getAccountBalanceProof(tree1, claimantAcct, balance1)
      const proof2 = getAccountBalanceProof(tree2, claimantAcct, balance2)
      const proofs = [proof1, proof2]

      const tranches = [tranche1, tranche2]

      const claimTx = await merkleDrop.claimWeeks(
        claimantAcct,
        tranches,
        balances,
        proofs,
      )

      expectEvent(claimTx, 'Claimed', {
        claimant: claimantAcct,
        week: tranche1,
        balance: balance1,
      })
      expectEvent(claimTx, 'Claimed', {
        claimant: claimantAcct,
        week: tranche2,
        balance: balance2,
      })
    })

    it('valid claims can be made on behalf of others', async () => {
      const [
        {
          tranche: tranche1,
          tree: tree1,
          balances: {
            [claimantAcct]: { balance: balance1 },
          },
        },
        {
          tranche: tranche2,
          tree: tree2,
          balances: {
            [claimantAcct]: { balance: balance2 },
          },
        },
      ] = await setup(TRANCHES.unclaimed, TRANCHES.unclaimed)

      const balances = [balance1, balance2]

      const proof1 = getAccountBalanceProof(tree1, claimantAcct, balance1)
      const proof2 = getAccountBalanceProof(tree2, claimantAcct, balance2)
      const proofs = [proof1, proof2]

      const tranches = [tranche1, tranche2]

      const claimTx = await merkleDrop.claimWeeks(
        claimantAcct,
        tranches,
        balances,
        proofs,
        { from: acctWithNoClaim },
      )

      expectEvent(claimTx, 'Claimed', {
        claimant: claimantAcct,
        week: tranche1,
        balance: balance1,
      })
      expectEvent(claimTx, 'Claimed', {
        claimant: claimantAcct,
        week: tranche2,
        balance: balance2,
      })
    })
  })
})
