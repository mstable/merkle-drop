import 'ts-node/register'
import 'tsconfig-paths/register'
import { task } from 'hardhat/config'
import { URL } from 'url'
import { create } from 'ipfs-http-client'
import { constants, BigNumber, Signer } from 'ethers'
import { formatUnits } from 'ethers/lib/utils'
import { DefenderRelayProvider, DefenderRelaySigner } from "defender-relay-client/lib/ethers"
import { Speed } from "defender-relay-client"

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Confirm from 'prompt-confirm'

import { MerkleDrop__factory, IERC20__factory, IERC20, MerkleDrop } from '../types/generated'
import { addressType, JSONBalances, jsonBalancesType } from './params'
import { createTreeWithAccounts } from './merkleTree'
import { boolean } from 'hardhat/internal/core/params/argumentTypes'

const multisigAddress = "0xF6FF1F7FCEB2cE6d26687EaaB5988b445d0b94a2"


const getIPFSUri = async (balances: JSONBalances): Promise<string> => {

  console.log('Pinning file to IPFS')

  const {
    protocol,
    hostname,
    pathname,
  } = new URL('https://api.thegraph.com/ipfs/')
  const client = create({
    protocol,
    host: hostname,
    port: 443,
    apiPath: `${pathname}/api/v0/`,
  })

  const buffer = Buffer.from(balances.body)

  const addResult = await client.add(buffer, { pin: true })
  const uri = `ipfs://${addResult.cid}`

  console.log('Pinned file', addResult.cid)
  return uri;
}

const getHexRoot = async (balances: JSONBalances): Promise<string> => {

  const merkleTree = createTreeWithAccounts(balances.parsed)
  const hexRoot = merkleTree.getHexRoot()
  return hexRoot;
}

async function seedNewAllocations(merkleDropContract: MerkleDrop, hexRoot: string, totalAllocation: BigNumber, uri: string, isSimulation = true) {
  console.log(`Seeding new allocations`)
  if (isSimulation) {
    console.log(`${multisigAddress} must execute ${merkleDropContract.address}.seedNewAllocations(${hexRoot}, ${totalAllocation}, ${uri})`)

  } else {
    const seedNewAllocationsTx = await merkleDropContract.seedNewAllocations(
      hexRoot,
      totalAllocation,
      uri
    )
    console.log(`Sending transaction ${seedNewAllocationsTx.hash}`)
    await seedNewAllocationsTx.wait()
  }
}

async function validateAllowance(tokenContract: IERC20, merkleDrop: string, totalAllocation: BigNumber, isSimulation = true) {
  const allowance = await tokenContract.allowance(multisigAddress, merkleDrop)

  if (allowance.lt(totalAllocation)) {
    console.log('Approval required; approving infinite')
    if (isSimulation) {
      console.log(`${multisigAddress} must execute ${tokenContract.address}.approve(${merkleDrop}, ${constants.MaxUint256})`)
    } else {
      const approvalTx = await tokenContract.approve(
        merkleDrop,
        constants.MaxUint256
      )
      console.log(`Sending transaction ${approvalTx.hash}`)
      await approvalTx.wait()
      console.log('Transaction complete')
    }
  }
}

export const getDefenderSigner = async (speed: Speed = "fast"): Promise<Signer> => {
  if (!process.env.DEFENDER_API_KEY || !process.env.DEFENDER_API_SECRET) {
      console.error(`Defender env vars DEFENDER_API_KEY and/or DEFENDER_API_SECRET have not been set`)
      process.exit(1)
  }
  if (!["safeLow", "average", "fast", "fastest"].includes(speed)) {
      console.error(`Defender Relay Speed param must be either 'safeLow', 'average', 'fast' or 'fastest'. Not "${speed}"`)
      process.exit(2)
  }
  const credentials = {
      apiKey: process.env.DEFENDER_API_KEY,
      apiSecret: process.env.DEFENDER_API_SECRET,
  }
  const provider = new DefenderRelayProvider(credentials)
  return new DefenderRelaySigner(credentials, provider, { speed })
}
task(
  'seedNewAllocations',
  'Adds a new tranche to an existing MerkleDrop contract',
)
  .addParam('merkleDrop','MerkleDrop contract address',undefined,addressType,false)
  .addParam('balances','JSON file with address => balance mapping',undefined,jsonBalancesType,false)
  .addOptionalParam('isSimulation', 'if true, will not send transactions', true, boolean)
  .setAction(
    async (
      {
        merkleDrop,
        balances: balancesPromise,
        isSimulation,
      }: {
        merkleDrop: string
        balances: JSONBalances,
        isSimulation: boolean
      },
      { network },
    ) => {
      const singer =  await getDefenderSigner("fast")
      const balances = await balancesPromise

      console.log(`Connecting using ${await singer.getAddress()} and url ${network.name}`)
      const uri: string = await getIPFSUri(balances);
      const hexRoot = await getHexRoot(balances)
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
      // if user input is valid
      const merkleDropContract = MerkleDrop__factory.connect(merkleDrop, singer)
      const token = await merkleDropContract.token()
      const tokenContract = IERC20__factory.connect(token, singer)

      await validateAllowance(tokenContract, merkleDrop, totalAllocation, isSimulation)

      await seedNewAllocations(merkleDropContract, hexRoot, totalAllocation, uri, isSimulation)
      console.log('Transaction complete')
    },
  )

export { }


