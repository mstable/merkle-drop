// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "./MerkleDrop.sol";

contract MerkleDropTranches is Ownable {
  event Register(address merkleDrop);
  event SetTrancheURI(address indexed merkleDrop, uint256 tranche, string uri);

  /**
   * @dev Simply emit an event indicating that a MerkleDrop contract should be tracked.
   * @param _merkleDrop MerkleDrop contract address
   */
  function register(address _merkleDrop) public onlyOwner {
    emit Register(_merkleDrop);
  }

  /**
   * @dev For a given MerkleDrop contract, set the URI for one of its tranches.
   * @param _merkleDrop MerkleDrop contract address
   * @param _tranche Tranche ID
   * @param _uri URI to associate with the tranche, e.g. an IPFS hash for a JSON document
   */
  function addTrancheURI(
    address _merkleDrop,
    uint256 _tranche,
    string memory _uri
  ) public {
    MerkleDrop merkleDrop = MerkleDrop(_merkleDrop);

    require(merkleDrop.funders(msg.sender), "Must be a funder");
    require(merkleDrop.merkleRoots(_tranche) != 0, "Tranche does not exist");

    emit SetTrancheURI(_merkleDrop, _tranche, _uri);
  }
}
