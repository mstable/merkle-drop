import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import 'hardhat-gas-reporter'
import 'solidity-coverage'

import type { HardhatUserConfig } from 'hardhat/config'

const hardhatConfig: HardhatUserConfig = {
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      gas: 'auto',
      gasPrice: 1,
      initialBaseFeePerGas: 1,
    },
    localhost: { url: 'http://localhost:8545' },
    fork: { url: 'http://localhost:7545' },
    // export the RPC_URL environment variable to use remote nodes like Alchemy or Infura. eg
    // export RPC_URL=https://eth-mainnet.alchemyapi.io/v2/yourApiKey
    env: { url: process.env.RPC_URL || '' },
    ropsten: {
      url: process.env.RPC_URL || '',
      accounts: process.env.ROPSTEN_PRIVATE_KEY1
        ? [process.env.ROPSTEN_PRIVATE_KEY1]
        : [],
      gasPrice: 30000000000,
      blockGasLimit: 8000000,
    },
    kovan: {
      url: process.env.RPC_URL || '',
      accounts: process.env.KOVAN_MNEMONIC
        ? { mnemonic: process.env.KOVAN_MNEMONIC }
        : [],
      gasPrice: 30000000000,
      blockGasLimit: 8000000,
    },
  },
  solidity: {
    version: '0.8.7',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: { artifacts: './build' },
  gasReporter: {
    currency: 'USD',
    gasPrice: 30,
  },
  mocha: {
    timeout: 240000, // 4 min timeout
  },
  typechain: {
    outDir: 'types/generated',
    target: 'ethers-v5',
    alwaysGenerateOverloads: true,
  },
}

export default hardhatConfig
