// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../LosslessGovernance.sol";

 contract MockTokenHolder {

     function claimCompensation(address _governanceAdress) public
     {
         LosslessGovernance(_governanceAdress).retrieveCompensation();
     }
 }