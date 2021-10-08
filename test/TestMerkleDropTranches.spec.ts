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
  MerkleDropTranches,
  MerkleDropTranches__factory,
} from '../types/generated'
import { TrancheBalances } from './types'
import { createTreeWithAccounts, MerkleTree } from '../tasks/merkleTree'
import { expectRevert } from './utils/expectRevert'
import { expectEvent } from './utils/expectEvent'
import { getTranche } from './utils/tranches'
import { simpleToExactAmount } from './utils/math'

chai.use(solidity)
chai.use(chaiAsPromised)

describe('MerkleDropTranches', () => {
  let token: TToken
  let merkleDrop: MerkleDrop
  let merkleDropTrancheURIs: MerkleDropTranches

  let funder: SignerWithAddress
  let otherAcct1: SignerWithAddress

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

        return { tranche, tree, balances, totalAmount }
      }),
    )
  }

  beforeEach(async () => {
    ;[funder, otherAcct1] = await ethers.getSigners()

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

    // Add funder
    await merkleDrop.addFunder(funder.address)

    // Mint TToken (large amount)
    const amount = simpleToExactAmount('100000000')
    await token.mint(funder.address, amount)

    // Deploy MerkleDropTranches
    const merkleDropTrancheURIsArtifact = await artifacts.readArtifact(
      'MerkleDropTranches',
    )
    const deployedMerkleDropTranches = await waffle.deployContract(
      funder,
      merkleDropTrancheURIsArtifact,
      [],
    )
    merkleDropTrancheURIs = MerkleDropTranches__factory.connect(
      deployedMerkleDropTranches.address,
      funder,
    )
  })

  describe('addTrancheURI', () => {
    it('only allows funders to add a tranche URI', async () => {
      await setup([getTranche([funder.address, '100'])], merkleDrop)

      const asOtherAcct1 = MerkleDropTranches__factory.connect(
        merkleDropTrancheURIs.address,
        otherAcct1,
      )
      await expectRevert(
        asOtherAcct1.addTrancheURI(
          merkleDrop.address,
          0,
          'ipfs://trancheURI-0',
        ),
        'Must be a funder',
      )

      const asFunder = MerkleDropTranches__factory.connect(
        merkleDropTrancheURIs.address,
        funder,
      )
      const addTrancheUriTx = await asFunder.addTrancheURI(
        merkleDrop.address,
        0,
        'ipfs://trancheURI-0',
      )
      await expectEvent(await addTrancheUriTx.wait(), 'SetTrancheURI', {
        merkleDrop: merkleDrop.address,
        tranche: '0',
        uri: 'ipfs://trancheURI-0',
      })
    })

    it('only allows adding a tranche URI for tranches that exist', async () => {
      const contract = MerkleDropTranches__factory.connect(
        merkleDropTrancheURIs.address,
        funder,
      )

      await setup([getTranche([funder.address, '100'])], merkleDrop)

      await expectRevert(
        contract.addTrancheURI(
          merkleDrop.address,
          100,
          'ipfs://trancheURI-100',
        ),
        'Tranche does not exist',
      )
    })

    it('allows setting URI for a given tranche more than once', async () => {
      await setup([getTranche([funder.address, '100'])], merkleDrop)

      const contract = MerkleDropTranches__factory.connect(
        merkleDropTrancheURIs.address,
        funder,
      )

      const addTrancheUriTx1 = await contract.addTrancheURI(
        merkleDrop.address,
        0,
        'ipfs://trancheURI-0',
      )
      await expectEvent(await addTrancheUriTx1.wait(), 'SetTrancheURI', {
        merkleDrop: merkleDrop.address,
        tranche: '0',
        uri: 'ipfs://trancheURI-0',
      })

      const addTrancheUriTx2 = await contract.addTrancheURI(
        merkleDrop.address,
        0,
        'ipfs://(Copy of FIX-fix-fix-final2.docx) 2',
      )
      await expectEvent(await addTrancheUriTx2.wait(), 'SetTrancheURI', {
        merkleDrop: merkleDrop.address,
        tranche: '0',
        uri: 'ipfs://(Copy of FIX-fix-fix-final2.docx) 2',
      })
    })
  })
})
