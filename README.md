# Merkle-drop

A lightweight Merkle Drop contract 

## Prerequisites

* [Node.js][1]

## Installation

    yarn install

## Testing

    yarn test

## Deployment

### Local deployment 

Start an instance of `ganache-cli`

    ganache-cli -p 7545 -l 8000000
  
Run the migration

    yarn migrate

### Rinkeby / Kovan

Edit `truffle-config.js`, and add a mnemonic for the `HDWalletProvider` for a private key that is funded. 

#### Deploy to Kovan

    yarn migrate:kovan

#### Deploy to Ropsten 

    yarn migrate:Ropsten

[1]: https://nodejs.org/
