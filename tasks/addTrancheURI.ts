import 'ts-node/register'
import 'tsconfig-paths/register'
import { task, types } from 'hardhat/config'
import { create } from 'ipfs-http-client'
import { promises as fs } from 'fs'

import { MerkleDropTranches__factory } from '../types/generated'
import { addressType } from './params'

task('addTrancheURI', 'Pins tranche data to IPFS and sets a new tranche URI')
  .addParam(
    'merkleDropTranches',
    'MerkleDropTranches contract address',
    undefined,
    addressType,
    false,
  )
  .addParam(
    'merkleDrop',
    'MerkleDrop contract address',
    undefined,
    addressType,
    false,
  )
  .addParam('id', 'Tranche ID', undefined, types.int, false)
  .addParam(
    'balances',
    'JSON file with address => balance mapping',
    undefined,
    types.string,
    false,
  )
  .setAction(
    async (
      {
        merkleDrop,
        merkleDropTranches,
        id,
        balances,
      }: {
        merkleDrop: string
        merkleDropTranches: string
        id: number
        balances: string
      },
      { ethers, network },
    ) => {
      console.log('Pinning file to IPFS')
      const url = new URL('https://api.thegraph.com/ipfs/')

      const client = create({
        protocol: url.protocol,
        host: url.hostname,
        port: 443,
        apiPath: url.pathname + '/api/v0/',
      })
      const buffer = await fs.readFile(balances)
      const addResult = await client.add(buffer, { pin: true })
      console.log('Pinned file', addResult.cid)

      const [deployer] = await ethers.getSigners()

      console.log(
        `Connecting using ${await deployer.getAddress()} and url ${
          network.name
        }`,
      )

      const merkleDropTranchesContract = MerkleDropTranches__factory.connect(
        merkleDropTranches,
        deployer,
      )

      console.log('Setting tranche URI')
      const ipfsHash = `ipfs://${addResult.cid}`
      let uriTx = await merkleDropTranchesContract.addTrancheURI(
        merkleDrop,
        id,
        ipfsHash,
      )
      console.log(`Sending transaction ${uriTx.hash}`)

      await uriTx.wait()
      console.log('Transaction complete')
    },
  )

export {}
