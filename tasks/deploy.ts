import 'ts-node/register'
import 'tsconfig-paths/register'
import { task } from 'hardhat/config'

import { MerkleDrop__factory } from '../types/generated'
import { addressArrType, addressType } from './params'

task('deploy', 'Deploys and initializes a MerkleDrop contract')
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
      )

      console.log(`Deploy transaction ${deployment.deployTransaction.hash}`)

      const { address: merkleDropAddress } = await deployment.deployed()
      console.log(`Deployed to ${merkleDropAddress}`)

      const merkleDrop = MerkleDrop__factory.connect(
        merkleDropAddress,
        deployer,
      )

      let initTx = await merkleDrop.initialize(funders, token)
      console.log(`Initialize transaction ${initTx.hash}`)

      await initTx.wait()
      console.log('Initialized')
    },
  )

export {}
