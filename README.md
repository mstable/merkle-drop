![CI](https://github.com/mstable/merkle-drop/workflows/Test/badge.svg)

# `@mstable/merkle-drop`

A lightweight Merkle Drop contract.

This project uses Hardhat.

## Basic workflow

- Use the `deployMerkleDrop` task to deploy a MerkleDrop
- Create a JSON balances file for each tranche
- Use the `seedNewAllocations` task to add a new tranche with JSON balances

## Pro workflow

- Use `MerkleDropTranches` to track `MerkleDrop` contracts on the subgraph (task: `registerMerkleDrop`)
- On frontends etc, use the subgraph and tranche URI to generate proofs for claims

## Hardhat Tasks

### Deploying MerkleDrop

    yarn hardhat deployMerkleDrop --token 0x... --funders 0x...,0x...

### Seeding new allocations (adding a tranche)

    # From a local file:
    yarn hardhat seedNewAllocations --merkle-drop 0x... --balances ./tranche0.json

    # Or, fetch balances from a remote resource:
    yarn hardhat seedNewAllocations --merkle-drop 0x... --balances https://raw.githubusercontent.com/mstable/stkBPT-merkle-drops/master/tranches/1/tranche-1.json

### Deploying MerkleDropTranches

    yarn hardhat deployMerkleDropTranches

### Registering a MerkleDrop on MerkleDropTranches (useful for subgraphs)

    yarn hardhat registerMerkleDrop --merkle-drop-tranches 0x... --merkle-drop 0x...

### Adding a new tranche URI (useful for subgraphs)

    yarn hardhat addTrancheURI --merkle-drop-tranches 0x... --merkle-drop 0x... --id 0  --balances ./tranche0.json

## Development

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

## Subgraph

This project includes a subgraph: `./subgraph`

[See the Kovan Deployment here](https://thegraph.com/hosted-service/subgraph/mstable/mstable-merkle-drop-kovan)

### Example usage

```graphql
query {
  merkleDrops {
    id
    tranches {
      trancheId
      uri
      merkleRoot
      claims(where: { account_ends_with: "0x9167be9ece1a7f20c22ceadbe4fafafcd88d655d" }) {
        amount
        claimed
        account {
          lastClaimedTranche {
            trancheId
          }
        }
      }
    }
  }
}
```

```json
{
  "data": {
    "merkleDrops": [
      {
        "id": "0x4278efcaef614b462d9193c7aa06e67a685bb586",
        "tranches": [
          {
            "claims": [
              {
                "account": {
                  "lastClaimedTranche": null
                },
                "amount": "20.22",
                "claimed": false
              }
            ],
            "merkleRoot": "0x893c9672ae7f772acf9e4f3f0eb86f071ced0ab52b2fc445d7147c2309d74024",
            "trancheId": 0,
            "uri": "ipfs://QmXAJS3xJLgnttfPzbD6G38bxMgEJ5me4MzFjXy1BiSDU2"
          }
        ]
      }
    ]
  }
}
```
