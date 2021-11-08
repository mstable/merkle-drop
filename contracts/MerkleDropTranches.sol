// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "./MerkleDrop.sol";

contract MerkleDropTranches is Ownable {
  event Register(address merkleDrop);

  /**
   * @dev Simply emit an event indicating that a MerkleDrop contract should be tracked.
   * @param _merkleDrop MerkleDrop contract address
   */
  function register(address _merkleDrop) public onlyOwner {
    emit Register(_merkleDrop);
  }
}
