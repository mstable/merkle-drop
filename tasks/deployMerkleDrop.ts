import 'ts-node/register'
import 'tsconfig-paths/register'
import { task } from 'hardhat/config'

import { MerkleDrop__factory } from '../types/generated'
import { addressArrType, addressType } from './params'

task('deployMerkleDrop', 'Deploys and initializes a MerkleDrop contract')
  .addParam(
    'funders',
    'Array of funder addresses',
    undefined,
    addressArrType,
    false,
  )
  .addParam(
    'token',
    'Address of token to be distributed',
    undefined,
    addressType,
    false,
  )
  .setAction(
    async (
      { funders, token }: { funders: string[]; token: string },
      { ethers, network, waffle, artifacts },
    ) => {
      const [deployer] = await ethers.getSigners()

      console.log(
        `Connecting using ${await deployer.getAddress()} and url ${
          network.name
        }`,
      )

      const deployment = await waffle.deployContract(
        deployer,
        artifacts.readArtifactSync('MerkleDrop'),
        [token],
      )

      console.log(`Deploy transaction ${deployment.deployTransaction.hash}`)

      const { address: merkleDropAddress } = await deployment.deployed()
      console.log(`Deployed to ${merkleDropAddress}`)

      const merkleDrop = MerkleDrop__factory.connect(
        merkleDropAddress,
        deployer,
      )

      console.log('Adding funder(s)')
      const addFunderTxs = await Promise.all(
        funders.map((funder) => merkleDrop.addFunder(funder)),
      )
      await Promise.all(addFunderTxs.map((tx) => tx.wait()))
      console.log('Added funder(s)')

      console.log('Initialized')
    },
  )

export {}
