import {
  SetTrancheURI,
  Register,
} from '../../generated/MerkleDropTranches/MerkleDropTranches'
import { MerkleDrop as MerkleDropTemplate } from '../../generated/templates'

import { Tranche } from '../Tranche'
import { MerkleDrop } from '../MerkleDrop'

export function handleSetTrancheURI(event: SetTrancheURI): void {
  MerkleDrop.getOrCreate(event.params.merkleDrop)

  Tranche.setURI(
    event.params.merkleDrop,
    event.params.tranche,
    event.params.uri,
  )
}

export function handleRegister(event: Register): void {
  MerkleDropTemplate.create(event.params.merkleDrop)
  MerkleDrop.getOrCreate(event.params.merkleDrop)
}
