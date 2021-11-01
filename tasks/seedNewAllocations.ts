import 'ts-node/register'
import 'tsconfig-paths/register'
import { task } from 'hardhat/config'
import { URL } from 'url'
import { create } from 'ipfs-http-client'
import { constants, BigNumber } from 'ethers'
import { formatUnits } from 'ethers/lib/utils'
// @ts-ignore
import Confirm from 'prompt-confirm'

import { MerkleDrop__factory, IERC20__factory } from '../types/generated'
import { addressType, JSONBalances, jsonBalancesType } from './params'
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
        balances: JSONBalances
      },
      { ethers, network },
    ) => {
      const [deployer] = await ethers.getSigners()
      const balances = await balancesPromise

      let uri: string
      {
        console.log('Pinning file to IPFS')

        const {
          protocol,
          hostname: host,
          pathname,
        } = new URL('https://api.thegraph.com/ipfs/')
        const client = create({
          protocol,
          host,
          port: 443,
          apiPath: `${pathname}/api/v0/`,
        })

        const buffer = Buffer.from(balances.body)

        const addResult = await client.add(buffer, { pin: true })
        uri = `ipfs://${addResult.cid}`

        console.log('Pinned file', addResult.cid)
      }

      console.log(
        `Connecting using ${await deployer.getAddress()} and url ${
          network.name
        }`,
      )

      const merkleDropContract = MerkleDrop__factory.connect(
        merkleDrop,
        deployer,
      )

      const merkleTree = createTreeWithAccounts(balances.parsed)
      const hexRoot = merkleTree.getHexRoot()

      const totalAllocation = Object.values(balances.parsed).reduce(
        (prev, balance) => prev.add(balance),
        BigNumber.from(0),
      )

      // Validate with user input
      {
        const totalSimple = formatUnits(totalAllocation)

        const prompt = new Confirm(
          [
            '-'.repeat(80),
            `Total allocation: ${totalAllocation} (${totalSimple})`,
            `Hex root: ${hexRoot}`,
            `URI: ${uri}`,
            'Seed these allocations?',
          ].join('\n'),
        )

        const confirmed = await prompt.run()
        if (!confirmed) {
          return
        }
      }

      const token = await merkleDropContract.token()
      const tokenContract = IERC20__factory.connect(token, deployer)

      const isFunder = await merkleDropContract.funders(deployer.address)
      if (!isFunder) {
        console.error('Not a funder')
        return
      }

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
        hexRoot,
        totalAllocation,
        uri,
      )
      console.log(`Sending transaction ${seedNewAllocationsTx.hash}`)

      await seedNewAllocationsTx.wait()
      console.log('Transaction complete')
    },
  )

export {}
