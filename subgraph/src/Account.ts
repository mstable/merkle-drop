import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import {
  Claim as ClaimEntity,
  Account as AccountEntity,
} from '../generated/schema'
import { Tranche } from './Tranche'
import { MerkleDrop } from './MerkleDrop'

export namespace Account {
  export function getId(merkleDrop: Address, account: Address): string {
    return merkleDrop.toHexString() + '.' + account.toHexString()
  }

  export function getClaimId(
    merkleDrop: Address,
    trancheId: BigInt,
    account: Address,
  ): string {
    return Tranche.getId(merkleDrop, trancheId) + '.' + account.toHexString()
  }

  export function getOrCreate(
    merkleDrop: Address,
    account: Address,
  ): AccountEntity {
    let id = getId(merkleDrop, account)
    let accountEntity = AccountEntity.load(id)
    if (accountEntity != null) {
      return accountEntity as AccountEntity
    }

    accountEntity = new AccountEntity(id)
    accountEntity.merkleDrop = merkleDrop.toHexString()
    accountEntity.address = account
    accountEntity.save()

    return accountEntity as AccountEntity
  }

  export function createClaim(
    merkleDrop: Address,
    trancheId: BigInt,
    claimant: Address,
    balance: BigDecimal,
  ): ClaimEntity {
    let merkleDropEntity = MerkleDrop.getOrCreate(merkleDrop)
    let trancheEntity = Tranche.getOrCreate(merkleDrop, trancheId)

    let accountEntity = getOrCreate(merkleDrop, claimant)

    let claimId = getClaimId(merkleDrop, trancheId, claimant)
    let claimEntity = ClaimEntity.load(claimId)

    if (claimEntity != null) {
      return claimEntity
    }

    claimEntity = new ClaimEntity(claimId)
    claimEntity.account = accountEntity.id
    claimEntity.claimed = false
    claimEntity.merkleDrop = merkleDropEntity.id
    claimEntity.tranche = trancheEntity.id
    claimEntity.amount = balance
    claimEntity.save()

    return claimEntity as ClaimEntity
  }

  export function claim(
    claimEntity: ClaimEntity,
    claimedAt: BigInt,
  ): ClaimEntity {
    let accountEntity = AccountEntity.load(claimEntity.account) as AccountEntity
    accountEntity.lastClaimedTranche = claimEntity.tranche
    accountEntity.save()

    claimEntity.claimedAt = claimedAt.toI32()
    claimEntity.claimed = true
    claimEntity.save()
    return claimEntity
  }
}
