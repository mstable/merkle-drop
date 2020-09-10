const Migrations = artifacts.require("Migrations");
const MerkleDrop = artifacts.require("MerkleDrop")

// Bind the first argument of the script to the global truffle argument,
// with `web3`, `artifacts` and so on, and pass in all CLI arguments.
module.exports = async (deployer, network, accounts) => {
    await deployer.deploy(Migrations);
    await deployer.deploy(MerkleDrop);
};
