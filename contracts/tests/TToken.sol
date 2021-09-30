// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.4;

// Test Token

contract TToken {
  string private _name;
  string private _symbol;
  uint8 private _decimals;

  address private _owner;

  uint256 internal _totalSupply;

  mapping(address => uint256) private _balance;
  mapping(address => mapping(address => uint256)) private _allowance;

  modifier _onlyOwner_() {
    require(msg.sender == _owner, "ERR_NOT_OWNER");
    _;
  }

  event Approval(address indexed src, address indexed dst, uint256 amt);
  event Transfer(address indexed src, address indexed dst, uint256 amt);

  // Math
  function add(uint256 a, uint256 b) internal pure returns (uint256 c) {
    require((c = a + b) >= a);
  }

  function sub(uint256 a, uint256 b) internal pure returns (uint256 c) {
    require((c = a - b) <= a);
  }

  constructor(
    string memory name,
    string memory symbol,
    uint8 decimals
  ) public {
    _name = name;
    _symbol = symbol;
    _decimals = decimals;
    _owner = msg.sender;
  }

  function name() public view returns (string memory) {
    return _name;
  }

  function symbol() public view returns (string memory) {
    return _symbol;
  }

  function decimals() public view returns (uint8) {
    return _decimals;
  }

  function _move(
    address src,
    address dst,
    uint256 amt
  ) internal {
    require(_balance[src] >= amt, "ERR_INSUFFICIENT_TTOKEN");
    _balance[src] = sub(_balance[src], amt);
    _balance[dst] = add(_balance[dst], amt);
    emit Transfer(src, dst, amt);
  }

  function _push(address to, uint256 amt) internal {
    _move(address(this), to, amt);
  }

  function _pull(address from, uint256 amt) internal {
    _move(from, address(this), amt);
  }

  function _mint(address dst, uint256 amt) internal {
    _balance[dst] = add(_balance[dst], amt);
    _totalSupply = add(_totalSupply, amt);
    emit Transfer(address(0), dst, amt);
  }

  function allowance(address src, address dst) external view returns (uint256) {
    return _allowance[src][dst];
  }

  function balanceOf(address whom) external view returns (uint256) {
    return _balance[whom];
  }

  function totalSupply() public view returns (uint256) {
    return _totalSupply;
  }

  function approve(address dst, uint256 amt) external returns (bool) {
    _allowance[msg.sender][dst] = amt;
    emit Approval(msg.sender, dst, amt);
    return true;
  }

  function mint(address dst, uint256 amt) public _onlyOwner_ returns (bool) {
    _mint(dst, amt);
    return true;
  }

  function burn(uint256 amt) public returns (bool) {
    require(_balance[address(this)] >= amt, "ERR_INSUFFICIENT_TTOKEN");
    _balance[address(this)] = sub(_balance[address(this)], amt);
    _totalSupply = sub(_totalSupply, amt);
    emit Transfer(address(this), address(0), amt);
    return true;
  }

  function transfer(address dst, uint256 amt) external returns (bool) {
    _move(msg.sender, dst, amt);
    return true;
  }

  function transferFrom(
    address src,
    address dst,
    uint256 amt
  ) external returns (bool) {
    require(msg.sender == src || amt <= _allowance[src][msg.sender], "ERR_TTOKEN_BAD_CALLER");
    _move(src, dst, amt);
    if (msg.sender != src && _allowance[src][msg.sender] != type(uint256).max) {
      _allowance[src][msg.sender] = sub(_allowance[src][msg.sender], amt);
      emit Approval(msg.sender, dst, _allowance[src][msg.sender]);
    }
    return true;
  }
}
