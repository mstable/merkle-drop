![CI](https://github.com/mstable/merkle-drop/workflows/Test/badge.svg)

# `@mstable/merkle-drop`

A lightweight Merkle Drop contract.

This project uses Hardhat.

## Usage

### Deployment

    yarn task deploy --token 0xTOKEN --funders 0xFUNDER

### Adding a new tranche

    yarn task add-tranche --contract 0xMERKLEDROP --json ./tranche1.json

### Installation in your project

    yarn add @mstable/merkle-drop

### Local development

    yarn install

## Testing

    yarn test

### Coverage

    yarn coverage

### Linting

    yarn lint
