import { task, types } from 'hardhat/config'

import { verifyEtherscan } from '../utils/etherscan'

task('verifyEtherscan', 'Verify the deployed contract on Etherscan')
  .addParam(
    'address',
    'Address for the contract to verify.',
    undefined,
    types.string,
    false,
  )
  .setAction(async (taskArgs, hre) => {
    // Deployed address: 0x783CC67242fd639a7621eA1A1C511E4C64D7C66d
    const address = taskArgs.address

    const balToken = '0xba100000625a3754423978a60c9317c58a424e3D'

    await verifyEtherscan(hre, {
      address,
      constructorArguments: [balToken],
      contract: 'contracts/MerkleDrop.sol:MerkleDrop',
    })

    console.log('Done!')
  })
