import 'ts-node/register'
import 'tsconfig-paths/register'
import { task } from 'hardhat/config'

task(
  'deployMerkleDropTranches',
  'Deploys a MerkleDropTranches contract',
).setAction(async (_, { ethers, network, waffle, artifacts }) => {
  const [deployer] = await ethers.getSigners()

  console.log(
    `Connecting using ${await deployer.getAddress()} and url ${network.name}`,
  )

  const deployment = await waffle.deployContract(
    deployer,
    artifacts.readArtifactSync('MerkleDropTranches'),
    [],
  )

  console.log(`Deploy transaction ${deployment.deployTransaction.hash}`)

  const { address } = await deployment.deployed()
  console.log(`Deployed to ${address}`)
})

export {}
