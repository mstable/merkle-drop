import 'ts-node/register'
import 'tsconfig-paths/register'
import { task } from 'hardhat/config'

import { MerkleDropTranches__factory } from '../types/generated'
import { addressType } from './params'

task('registerMerkleDrop', 'Registers a MerkleDrop contract')
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
  .setAction(
    async (
      {
        merkleDrop,
        merkleDropTranches,
      }: {
        merkleDrop: string
        merkleDropTranches: string
      },
      { ethers, network },
    ) => {
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
      console.log('Registering MerkleDrop')
      let registerTx = await merkleDropTranchesContract.register(merkleDrop)
      console.log(`Sending transaction ${registerTx.hash}`)

      await registerTx.wait()
      console.log('Transaction complete')
    },
  )

export {}
