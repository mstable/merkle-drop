import { Address } from '@graphprotocol/graph-ts'

import { MerkleDrop as MerkleDropContract } from '../generated/templates/MerkleDrop/MerkleDrop'
import { MerkleDrop as MerkleDropEntity } from '../generated/schema'

import { Token } from './Token'

export namespace MerkleDrop {
  export function getOrCreate(address: Address): MerkleDropEntity {
    let id = address.toHexString()
    let entity = MerkleDropEntity.load(id)

    if (entity != null) {
      return entity as MerkleDropEntity
    }

    let contract = MerkleDropContract.bind(address)

    entity = new MerkleDropEntity(id)
    entity.token = Token.getOrCreate(contract.token()).id
    entity.save()

    return entity as MerkleDropEntity
  }
}
