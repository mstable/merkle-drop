import {
  Address,
  BigInt,
  Bytes,
  JSONValue,
  ipfs,
  json,
  BigDecimal,
} from '@graphprotocol/graph-ts'

import { Tranche as TrancheEntity } from '../generated/schema'
import { MerkleDrop as MerkleDropContract } from '../generated/MerkleDrop/MerkleDrop'
import { Account } from './Account'

export namespace Tranche {
  export function getId(address: Address, trancheId: BigInt): string {
    return address.toHexString() + '.' + trancheId.toString()
  }

  export function getOrCreate(
    address: Address,
    trancheId: BigInt,
  ): TrancheEntity {
    let id = getId(address, trancheId)
    let entity = TrancheEntity.load(id)

    if (entity != null) {
      return entity as TrancheEntity
    }

    let contract = MerkleDropContract.bind(address)

    entity = new TrancheEntity(id)
    entity.trancheId = trancheId.toI32()
    entity.merkleDrop = address.toHexString()
    entity.merkleRoot = contract.merkleRoots(trancheId)
    entity.totalAllocation = BigInt.fromI32(0)
    entity.expired = false
    entity.addedAt = 0

    entity.save()

    return entity as TrancheEntity
  }

  export function setURI(
    merkleDrop: Address,
    trancheId: BigInt,
    uri: string,
  ): void {
    let trancheEntity = getOrCreate(merkleDrop, trancheId)
    trancheEntity.uri = uri

    if (uri.slice(0, 7) == 'ipfs://') {
      let hash = uri.slice(7)
      let maybeJsonBytes = ipfs.cat(hash)
      if (maybeJsonBytes && maybeJsonBytes.length > 0) {
        createClaims(merkleDrop, trancheId, maybeJsonBytes as Bytes)
      }
    }

    trancheEntity.save()
  }

  function createClaims(
    merkleDrop: Address,
    trancheId: BigInt,
    jsonBytes: Bytes,
  ): void {
    let jsonValue = json.try_fromBytes(jsonBytes)
    if (!jsonValue.isOk) return

    let entries = jsonValue.value.toObject().entries
    for (let i = 0; i < entries.length; i++) {
      let obj = entries[i]

      let claimant = Address.fromString(obj.key)

      // Assume 18 decimals
      let balance = BigDecimal.fromString(obj.value.toString())

      Account.createClaim(merkleDrop, trancheId, claimant, balance)
    }
  }
}
