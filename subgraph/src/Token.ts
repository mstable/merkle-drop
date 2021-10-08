import { Address } from '@graphprotocol/graph-ts'

import { Token as TokenEntity } from '../generated/schema'
import { ERC20 } from '../generated/MerkleDropTranches/ERC20'

export namespace Token {
  export function getOrCreate(address: Address): TokenEntity {
    let id = address.toHexString()
    let entity = TokenEntity.load(id)

    if (entity != null) {
      return entity as TokenEntity
    }

    let contract = ERC20.bind(address)

    entity = new TokenEntity(id)
    entity.address = address
    entity.symbol = contract.symbol()
    entity.decimals = contract.decimals()
    entity.name = contract.name()

    entity.save()

    return entity as TokenEntity
  }
}
