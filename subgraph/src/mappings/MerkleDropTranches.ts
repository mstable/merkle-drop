import { Register } from '../../generated/MerkleDropTranches/MerkleDropTranches'
import { MerkleDrop as MerkleDropTemplate } from '../../generated/templates'

import { MerkleDrop } from '../MerkleDrop'

export function handleRegister(event: Register): void {
  MerkleDropTemplate.create(event.params.merkleDrop)
  MerkleDrop.getOrCreate(event.params.merkleDrop)
}
