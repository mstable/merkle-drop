import {
  Claimed,
  FunderAdded,
  FunderRemoved,
  OwnershipTransferred,
  TrancheAdded,
  TrancheExpired,
} from '../../generated/templates/MerkleDrop/MerkleDrop'

import { Account } from '../Account'
import { MerkleDrop } from '../MerkleDrop'
import { Tranche } from '../Tranche'
import { Bytes } from '@graphprotocol/graph-ts'

export function handleClaimed(event: Claimed): void {
  let claimEntity = Account.createClaim(
    event.address,
    event.params.tranche,
    event.params.claimant,
    event.params.balance.toBigDecimal(),
  )
  Account.claim(claimEntity, event.block.timestamp)
}

export function handleFunderAdded(event: FunderAdded): void {
  let merkleDropEntity = MerkleDrop.getOrCreate(event.address)
  merkleDropEntity.funders.push(event.params._address)
  merkleDropEntity.save()
}

export function handleFunderRemoved(event: FunderRemoved): void {
  let merkleDropEntity = MerkleDrop.getOrCreate(event.address)

  let removed = event.params._address
  let oldFunders = merkleDropEntity.funders
  let newFunders: Bytes[] = []
  for (let i = 0; i < oldFunders.length; i++) {
    if (oldFunders[i] != removed) {
      newFunders.push(oldFunders[i])
    }
  }
  merkleDropEntity.funders = newFunders
  merkleDropEntity.save()
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {
  let merkleDropEntity = MerkleDrop.getOrCreate(event.address)
  merkleDropEntity.owner = event.params.newOwner
  merkleDropEntity.save()
}

export function handleTrancheAdded(event: TrancheAdded): void {
  MerkleDrop.getOrCreate(event.address)

  let trancheEntity = Tranche.getOrCreate(event.address, event.params.tranche)
  trancheEntity.merkleRoot = event.params.merkleRoot
  trancheEntity.totalAllocation = event.params.totalAmount
  trancheEntity.addedAt = event.block.timestamp.toI32()
  trancheEntity = Tranche.setURI(trancheEntity, event.params.uri)
  trancheEntity.save()
}

export function handleTrancheExpired(event: TrancheExpired): void {
  MerkleDrop.getOrCreate(event.address)

  let trancheEntity = Tranche.getOrCreate(event.address, event.params.tranche)
  trancheEntity.expired = true
  trancheEntity.save()
}
