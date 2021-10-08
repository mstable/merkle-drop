import 'ts-node/register'
import 'tsconfig-paths/register'
import { task } from 'hardhat/config'
import { constants } from 'ethers'

import { MerkleDrop__factory, IERC20__factory } from '../types/generated'
import { addressType, jsonBalancesType } from './params'
import { BigNumber } from 'ethers'
import { createTreeWithAccounts } from './merkleTree'

task(
  'seedNewAllocations',
  'Adds a new tranche to an existing MerkleDrop contract',
)
  .addParam(
    'merkleDrop',
    'MerkleDrop contract address',
    undefined,
    addressType,
    false,
  )
  .addParam(
    'balances',
    'JSON file with address => balance mapping',
    undefined,
    jsonBalancesType,
    false,
  )
  .setAction(
    async (
      {
        merkleDrop,
        balances: balancesPromise,
      }: {
        merkleDrop: string
        balances: Record<string, { balance: BigNumber }>
      },
      { ethers, network },
    ) => {
      const [deployer] = await ethers.getSigners()
      const balances = await balancesPromise

      console.log(
        `Connecting using ${await deployer.getAddress()} and url ${
          network.name
        }`,
      )

      const merkleDropContract = MerkleDrop__factory.connect(
        merkleDrop,
        deployer,
      )

      const merkleTree = createTreeWithAccounts(balances)

      const totalAllocation = Object.values(balances).reduce(
        (prev, { balance }) => prev.add(balance),
        BigNumber.from(0),
      )

      const token = await merkleDropContract.token()
      const tokenContract = IERC20__factory.connect(token, deployer)
      const allowance = await tokenContract.allowance(
        deployer.address,
        merkleDrop,
      )

      if (allowance.lt(totalAllocation)) {
        console.log('Approval required; approving infinite')
        const approvalTx = await tokenContract.approve(
          merkleDrop,
          constants.MaxUint256,
        )
        console.log(`Sending transaction ${approvalTx.hash}`)
        await approvalTx.wait()
        console.log('Transaction complete')
      }

      console.log(`Seeding new allocations`)
      let seedNewAllocationsTx = await merkleDropContract.seedNewAllocations(
        merkleTree.hexRoot,
        totalAllocation,
      )
      console.log(`Sending transaction ${seedNewAllocationsTx.hash}`)

      await seedNewAllocationsTx.wait()
      console.log('Transaction complete')
    },
  )

export {}
