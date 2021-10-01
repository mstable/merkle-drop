import { ethers, waffle, artifacts } from 'hardhat'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { solidity } from 'ethereum-waffle'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import {
  MerkleDrop,
  MerkleDrop__factory,
  TToken,
  TToken__factory,
} from '../types/generated'
import { AccountBalancesTuple, TrancheBalances } from './types'
import {
  createTreeWithAccounts,
  getAccountBalanceProof,
  MerkleTree,
} from '../tasks/merkleTree'
import { simpleToExactAmount } from './utils/math'
import { expectRevert } from './utils/expectRevert'
import { expectEvent } from './utils/expectEvent'
import { ZERO_ADDRESS } from '@openzeppelin/upgrades/lib/utils/Addresses'

chai.use(solidity)
chai.use(chaiAsPromised)
const { expect } = chai

const getTranche = (
  ...accountBalances: AccountBalancesTuple
): TrancheBalances =>
  accountBalances.reduce<TrancheBalances>(
    (prev, [account, balance, claimed]) => ({
      ...prev,
      [account]: { balance: simpleToExactAmount(balance), claimed },
    }),
    {},
  )

describe('MerkleDrop', () => {
  let token: TToken
  let merkleDrop: MerkleDrop
  let funder: SignerWithAddress
  let claimantAcct: SignerWithAddress
  let acctWithNoClaim: SignerWithAddress
  let otherAcct1: SignerWithAddress
  let otherAcct2: SignerWithAddress
  let otherAcct3: SignerWithAddress
  let TRANCHES: {
    unclaimed: TrancheBalances
    claimed: TrancheBalances
    noBalance: TrancheBalances
  }

  const setup = async (
    tranches: TrancheBalances[],
    _merkleDrop = merkleDrop,
  ): Promise<
    {
      tranche: string
      tree: MerkleTree
      balances: TrancheBalances
      totalAmount: BigNumber
    }[]
  > => {
    // Approval cumulative amount
    const cumulativeAmount = tranches.reduce(
      (prev, balances) =>
        prev.add(
          Object.values(balances).reduce(
            (trancheAmount, { balance }) => trancheAmount.add(balance),
            BigNumber.from(0),
          ),
        ),
      BigNumber.from(0),
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
          BigNumber.from(0),
        )

        const seedTx = await merkleDrop.seedNewAllocations(
          merkleRoot,
          totalAmount,
        )
        expectEvent(await seedTx.wait(), 'TrancheAdded', {
          tranche,
          merkleRoot,
          totalAmount,
        })

        // Perform claims
        const claims = Object.entries(balances)
          .filter(([, value]) => value.claimed)
          .map(([account, { balance }]) => {
            const proof = getAccountBalanceProof(tree, account, balance)
            return merkleDrop.claimTranche(account, tranche, balance, proof)
          })
        await Promise.all(claims)

        return { tranche, tree, balances, totalAmount }
      }),
    )
  }

  beforeEach(async () => {
    ;[
      funder,
      claimantAcct,
      acctWithNoClaim,
      otherAcct1,
      otherAcct2,
      otherAcct3,
    ] = await ethers.getSigners()

    // Deploy TToken
    const ttokenArtifact = await artifacts.readArtifact('TToken')
    const deployedToken = await waffle.deployContract(funder, ttokenArtifact, [
      'TToken',
      'TKN',
      18,
    ])
    token = TToken__factory.connect(deployedToken.address, funder)

    // Deploy MerkleDrop
    const merkleDropArtifact = await artifacts.readArtifact('MerkleDrop')
    const deployedMerkleDrop = await waffle.deployContract(
      funder,
      merkleDropArtifact,
      [token.address],
    )
    merkleDrop = MerkleDrop__factory.connect(deployedMerkleDrop.address, funder)
  })

  describe('without initialisation', () => {
    it('only allows funders to seed new allocations', async () => {
      const amount = simpleToExactAmount('1000')
      const tree = createTreeWithAccounts({
        [otherAcct1.address]: { balance: amount },
      })

      const merkleDropAsNonFunder = MerkleDrop__factory.connect(
        merkleDrop.address,
        otherAcct1,
      )

      await setup([], merkleDropAsNonFunder)

      await token.approve(merkleDrop.address, amount)

      await expectRevert(
        merkleDropAsNonFunder.seedNewAllocations(tree.hexRoot, amount),
        'Must be a funder',
      )
    })
  })

  describe('with initialisation', () => {
    beforeEach(async () => {
      // Initialize MerkleDrop
      await merkleDrop.addFunder(funder.address)

      // Mint TToken (large amount)
      const amount = simpleToExactAmount('100000000')
      await token.mint(funder.address, amount)

      TRANCHES = {
        unclaimed: getTranche(
          [claimantAcct.address, '100'],
          [otherAcct1.address, '25'],
          [otherAcct2.address, '75'],
          [otherAcct3.address, '3000'],
        ),
        claimed: getTranche(
          [claimantAcct.address, '100', true],
          [otherAcct1.address, '1'],
          [otherAcct3.address, '3000'],
        ),
        noBalance: getTranche(
          [claimantAcct.address, '0'],
          [otherAcct1.address, '10000'],
          [otherAcct2.address, '1'],
          [otherAcct3.address, '10000'],
        ),
      }
    })

    describe('verifyClaim', async () => {
      it('proofs for expired tranches are not verified', async () => {
        const tranches = await setup([TRANCHES.unclaimed])

        const balance = simpleToExactAmount('100')

        const proof = getAccountBalanceProof(
          tranches[0].tree,
          claimantAcct.address,
          balance,
        )

        const verifiedBeforeExpiration = await merkleDrop.verifyClaim(
          claimantAcct.address,
          tranches[0].tranche,
          balance,
          proof,
        )

        expect(verifiedBeforeExpiration).eq(
          true,
          'Proof should be verified for non-expired tranche',
        )

        const expireTx = await merkleDrop.expireTranche(tranches[0].tranche)

        expectEvent(await expireTx.wait(), 'TrancheExpired', {
          tranche: tranches[0].tranche,
        })

        const verifiedAfterExpiration = await merkleDrop.verifyClaim(
          claimantAcct.address,
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

    describe('claimTranche', () => {
      it('invalid account does not get claimed', async () => {
        const [{ tranche }] = await setup([
          // Just acct1.address, not acct2
          TRANCHES.unclaimed,
        ])

        const balance = simpleToExactAmount('100')

        const treeWithAcct2 = createTreeWithAccounts({
          [acctWithNoClaim.address]: { balance },
        })
        const proof = getAccountBalanceProof(
          treeWithAcct2,
          acctWithNoClaim.address,
          balance,
        )

        const claimPromise = merkleDrop.claimTranche(
          acctWithNoClaim.address,
          tranche,
          balance,
          proof,
        )

        await expectRevert(claimPromise, 'Incorrect merkle proof')
      })

      it('invalid balance does not get claimed', async () => {
        const [{ tranche }] = await setup([TRANCHES.unclaimed])

        // Over the balance acct1.address should be able to claim
        const balance = simpleToExactAmount('1000')

        const treeWithHigherBalance = createTreeWithAccounts({
          [claimantAcct.address]: { balance },
        })
        const proof = getAccountBalanceProof(
          treeWithHigherBalance,
          claimantAcct.address,
          balance,
        )

        const claimPromise = merkleDrop.claimTranche(
          claimantAcct.address,
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
              [claimantAcct.address]: { balance },
            },
          },
        ] = await setup([
          // Only tranche 1
          TRANCHES.unclaimed,
        ])

        const proof = getAccountBalanceProof(
          tree,
          claimantAcct.address,
          balance,
        )

        const claimPromise = merkleDrop.claimTranche(
          claimantAcct.address,
          2, // Tranche 2 should not exist yet
          balance,
          proof,
        )

        await expectRevert(claimPromise, 'Tranche cannot be in the future')
      })

      it('address cannot claim the same tranche more than once', async () => {
        const [
          {
            tree,
            tranche,
            balances: {
              [claimantAcct.address]: { balance },
            },
          },
        ] = await setup([TRANCHES.claimed])

        const proof = getAccountBalanceProof(
          tree,
          claimantAcct.address,
          balance,
        )

        const claimPromise = merkleDrop.claimTranche(
          claimantAcct.address,
          tranche,
          balance,
          proof,
        )

        await expectRevert(claimPromise, 'Address has already claimed')
      })

      it('address cannot claim balance of 0', async () => {
        const [
          {
            tree,
            tranche,
            balances: {
              [claimantAcct.address]: { balance },
            },
          },
        ] = await setup([TRANCHES.noBalance])

        const proof = getAccountBalanceProof(
          tree,
          claimantAcct.address,
          balance,
        )

        const claimPromise = merkleDrop.claimTranche(
          claimantAcct.address,
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
              [claimantAcct.address]: { balance },
            },
          },
        ] = await setup([TRANCHES.unclaimed])

        const proof = getAccountBalanceProof(
          tree,
          claimantAcct.address,
          balance,
        )

        const claimTx = await merkleDrop.claimTranche(
          claimantAcct.address,
          tranche,
          balance,
          proof,
        )

        expectEvent(await claimTx.wait(), 'Claimed', {
          claimant: claimantAcct.address,
          tranche,
          balance,
        })
      })

      it('valid claims can be made on behalf of others', async () => {
        const [
          {
            tree,
            tranche,
            balances: {
              [claimantAcct.address]: { balance },
            },
          },
        ] = await setup([TRANCHES.unclaimed])

        const proof = getAccountBalanceProof(
          tree,
          claimantAcct.address,
          balance,
        )

        const claimTx = await MerkleDrop__factory.connect(
          merkleDrop.address,
          acctWithNoClaim,
        ).claimTranche(claimantAcct.address, tranche, balance, proof)

        expectEvent(await claimTx.wait(), 'Claimed', {
          claimant: claimantAcct.address,
          tranche,
          balance,
        })
      })
    })

    describe('claimTranches', () => {
      it('invalid account does not get claimed', async () => {
        const [{ tranche: tranche1 }, { tranche: tranche2 }] = await setup([
          // Just acct1.address, not acct2
          TRANCHES.unclaimed,
          TRANCHES.unclaimed,
        ])

        const balances = [
          simpleToExactAmount('100'),
          simpleToExactAmount('100'),
        ]

        const tree1 = createTreeWithAccounts({
          [acctWithNoClaim.address]: { balance: balances[0] },
        })
        const tree2 = createTreeWithAccounts({
          [acctWithNoClaim.address]: { balance: balances[1] },
        })

        const proof1 = getAccountBalanceProof(
          tree1,
          acctWithNoClaim.address,
          balances[0],
        )
        const proof2 = getAccountBalanceProof(
          tree2,
          acctWithNoClaim.address,
          balances[0],
        )

        const claimPromise = merkleDrop.claimTranches(
          acctWithNoClaim.address,
          [tranche1, tranche2],
          balances,
          [proof1, proof2],
        )

        await expectRevert(claimPromise, 'Incorrect merkle proof')
      })

      it('invalid balances do not get claimed', async () => {
        const [{ tranche: tranche1 }, { tranche: tranche2 }] = await setup([
          TRANCHES.unclaimed,
          TRANCHES.unclaimed,
        ])

        // Over the balances acct1.address should be able to claim
        const balances = [
          simpleToExactAmount('1000'),
          simpleToExactAmount('1000'),
        ]

        const tree1 = createTreeWithAccounts({
          [claimantAcct.address]: { balance: balances[0] },
        })
        const tree2 = createTreeWithAccounts({
          [claimantAcct.address]: { balance: balances[1] },
        })

        const proof1 = getAccountBalanceProof(
          tree1,
          claimantAcct.address,
          balances[0],
        )
        const proof2 = getAccountBalanceProof(
          tree2,
          claimantAcct.address,
          balances[0],
        )

        const claimPromise = merkleDrop.claimTranches(
          claimantAcct.address,
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
              [claimantAcct.address]: { balance: balance1 },
            },
          },
          {
            tree: tree2,
            balances: {
              [claimantAcct.address]: { balance: balance2 },
            },
          },
        ] = await setup([TRANCHES.unclaimed, TRANCHES.unclaimed])

        const balances = [balance1, balance2]

        const proof1 = getAccountBalanceProof(
          tree1,
          claimantAcct.address,
          balance1,
        )
        const proof2 = getAccountBalanceProof(
          tree2,
          claimantAcct.address,
          balance2,
        )
        const proofs = [proof1, proof2]

        const claimPromise = merkleDrop.claimTranches(
          claimantAcct.address,
          [
            2, // Tranche 1 exists
            3, // but tranche 2 doesn't exist yet
          ],
          balances,
          proofs,
        )

        await expectRevert(claimPromise, 'Tranche cannot be in the future')
      })

      it('address cannot claim the same tranches more than once', async () => {
        const [
          {
            tranche: tranche1,
            tree: tree1,
            balances: {
              [claimantAcct.address]: { balance: balance1 },
            },
          },
          {
            tranche: tranche2,
            tree: tree2,
            balances: {
              [claimantAcct.address]: { balance: balance2 },
            },
          },
        ] = await setup([
          TRANCHES.claimed, // claimed
          TRANCHES.unclaimed, // not claimed
        ])

        const balances = [balance1, balance2]

        const proof1 = getAccountBalanceProof(
          tree1,
          claimantAcct.address,
          balance1,
        )
        const proof2 = getAccountBalanceProof(
          tree2,
          claimantAcct.address,
          balance2,
        )
        const proofs = [proof1, proof2]

        const claimPromise = merkleDrop.claimTranches(
          claimantAcct.address,
          [tranche1, tranche2],
          balances,
          proofs,
        )

        await expectRevert(claimPromise, 'Address has already claimed')
      })

      it('tranches, balances and proofs must match', async () => {
        const [
          {
            tranche: tranche1,
            tree: tree1,
            balances: {
              [claimantAcct.address]: { balance: balance1 },
            },
          },
          {
            tranche: tranche2,
            tree: tree2,
            balances: {
              [claimantAcct.address]: { balance: balance2 },
            },
          },
        ] = await setup([TRANCHES.unclaimed, TRANCHES.unclaimed])

        const balances = [balance1, balance2]

        const proof1 = getAccountBalanceProof(
          tree1,
          claimantAcct.address,
          balance1,
        )
        const proof2 = getAccountBalanceProof(
          tree2,
          claimantAcct.address,
          balance2,
        )
        const proofs = [proof1, proof2]

        await expectRevert(
          merkleDrop.claimTranches(
            claimantAcct.address,
            [tranche1, tranche2],
            [balances[0]], // one balance
            proofs,
          ),
          'Mismatching inputs',
        )

        await expectRevert(
          merkleDrop.claimTranches(
            claimantAcct.address,
            [tranche1, tranche2],
            [...balances, simpleToExactAmount('100')], // extra balance
            proofs,
          ),
          'Mismatching inputs',
        )

        await expectRevert(
          merkleDrop.claimTranches(
            claimantAcct.address,
            [tranche1, tranche2],
            balances,
            [], // no proofs
          ),
          'Mismatching inputs',
        )

        await expectRevert(
          merkleDrop.claimTranches(
            claimantAcct.address,
            [tranche1, tranche2],
            balances,
            [proofs[0]], // one proof
          ),
          'Mismatching inputs',
        )

        await expectRevert(
          merkleDrop.claimTranches(
            claimantAcct.address,
            [tranche1, tranche2],
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
              [claimantAcct.address]: { balance: balance1 },
            },
          },
          {
            tranche: tranche2,
            tree: tree2,
            balances: {
              [claimantAcct.address]: { balance: balance2 },
            },
          },
        ] = await setup([TRANCHES.unclaimed, TRANCHES.unclaimed])

        const balances = [balance1, balance2]

        const proof1 = getAccountBalanceProof(
          tree1,
          claimantAcct.address,
          balance1,
        )
        const proof2 = getAccountBalanceProof(
          tree2,
          claimantAcct.address,
          balance2,
        )
        const proofs = [proof1, proof2]

        const claimTx = await merkleDrop.claimTranches(
          claimantAcct.address,
          [tranche1, tranche2],
          balances,
          proofs,
        )

        expectEvent(await claimTx.wait(), 'Claimed', {
          claimant: claimantAcct.address,
          tranche: tranche1,
          balance: balance1,
        })
        expectEvent(await claimTx.wait(), 'Claimed', {
          claimant: claimantAcct.address,
          tranche: tranche2,
          balance: balance2,
        })
      })

      it('valid claims can be made on behalf of others', async () => {
        const [
          {
            tranche: tranche1,
            tree: tree1,
            balances: {
              [claimantAcct.address]: { balance: balance1 },
            },
          },
          {
            tranche: tranche2,
            tree: tree2,
            balances: {
              [claimantAcct.address]: { balance: balance2 },
            },
          },
        ] = await setup([TRANCHES.unclaimed, TRANCHES.unclaimed])

        const balances = [balance1, balance2]

        const proof1 = getAccountBalanceProof(
          tree1,
          claimantAcct.address,
          balance1,
        )
        const proof2 = getAccountBalanceProof(
          tree2,
          claimantAcct.address,
          balance2,
        )
        const proofs = [proof1, proof2]

        const claimTx = await MerkleDrop__factory.connect(
          merkleDrop.address,
          acctWithNoClaim,
        ).claimTranches(
          claimantAcct.address,
          [tranche1, tranche2],
          balances,
          proofs,
        )

        expectEvent(await claimTx.wait(), 'Claimed', {
          claimant: claimantAcct.address,
          tranche: tranche1,
          balance: balance1,
        })
        expectEvent(await claimTx.wait(), 'Claimed', {
          claimant: claimantAcct.address,
          tranche: tranche2,
          balance: balance2,
        })
      })

      it('valid claims can be made on behalf of others', async () => {
        const [
          {
            tranche: tranche1,
            tree: tree1,
            balances: {
              [claimantAcct.address]: { balance: balance1 },
            },
          },
          {
            tranche: tranche2,
            tree: tree2,
            balances: {
              [claimantAcct.address]: { balance: balance2 },
            },
          },
        ] = await setup([TRANCHES.unclaimed, TRANCHES.unclaimed])

        const balances = [balance1, balance2]

        const proof1 = getAccountBalanceProof(
          tree1,
          claimantAcct.address,
          balance1,
        )
        const proof2 = getAccountBalanceProof(
          tree2,
          claimantAcct.address,
          balance2,
        )
        const proofs = [proof1, proof2]

        const claimTx = await MerkleDrop__factory.connect(
          merkleDrop.address,
          acctWithNoClaim,
        ).claimTranches(
          claimantAcct.address,
          [tranche1, tranche2],
          balances,
          proofs,
        )

        expectEvent(await claimTx.wait(), 'Claimed', {
          claimant: claimantAcct.address,
          tranche: tranche1,
          balance: balance1,
        })
        expectEvent(await claimTx.wait(), 'Claimed', {
          claimant: claimantAcct.address,
          tranche: tranche2,
          balance: balance2,
        })
      })
    })

    describe('funders', () => {
      it('adds funders as the owner', async () => {
        await setup([TRANCHES.unclaimed])

        const addTx = await merkleDrop.addFunder(otherAcct1.address)
        expectEvent(await addTx.wait(), 'FunderAdded', {
          _address: otherAcct1.address,
        })
      })

      it('does not add funders as non-owner', async () => {
        await setup([TRANCHES.unclaimed])

        const merkleDropAsNonOwner = MerkleDrop__factory.connect(
          merkleDrop.address,
          otherAcct1,
        )
        await expectRevert(
          merkleDropAsNonOwner.addFunder(otherAcct1.address),
          'Ownable: caller is not the owner',
        )
      })

      it('does not re-add current funder', async () => {
        await setup([TRANCHES.unclaimed])

        await merkleDrop.addFunder(otherAcct1.address)
        await expectRevert(
          merkleDrop.addFunder(otherAcct1.address),
          'Already a funder',
        )
      })

      it('does not add zero address funder', async () => {
        await setup([TRANCHES.unclaimed])

        await expectRevert(
          merkleDrop.addFunder(ZERO_ADDRESS),
          'Address is zero',
        )
      })

      it('does not remove zero address funder', async () => {
        await setup([TRANCHES.unclaimed])

        await expectRevert(
          merkleDrop.removeFunder(ZERO_ADDRESS),
          'Address is zero',
        )
      })

      it('removes funders as the owner', async () => {
        await setup([TRANCHES.unclaimed])

        await merkleDrop.addFunder(otherAcct1.address, {
          from: funder.address,
        })
        const removeTx = await merkleDrop.removeFunder(otherAcct1.address)
        expectEvent(await removeTx.wait(), 'FunderRemoved', {
          _address: otherAcct1.address,
        })
      })

      it('does not remove funders as non-owner', async () => {
        await setup([TRANCHES.unclaimed])

        const merkleDropAsNonOwner = MerkleDrop__factory.connect(
          merkleDrop.address,
          otherAcct1,
        )

        await merkleDrop.addFunder(otherAcct1.address)

        await expectRevert(
          merkleDropAsNonOwner.removeFunder(otherAcct1.address, {
            from: otherAcct1.address,
          }),
          'Ownable: caller is not the owner',
        )
      })

      it('does not remove non-funders', async () => {
        await setup([TRANCHES.unclaimed])

        await expectRevert(
          merkleDrop.removeFunder(otherAcct1.address),
          'Address is not a funder',
        )
      })
    })
  })
})
