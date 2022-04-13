/* eslint-disable max-len */
/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable prefer-destructuring */
const { time, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const path = require('path');
const { setupAddresses, setupEnvironment, setupToken } = require('../utils');

let adr;
let env;
let mockHolderContract;
let mockContractReportId;

const scriptName = path.basename(__filename, '.js');

const everyoneVoteNegative = async (reportId) => {
  await env.lssGovernance.connect(adr.lssAdmin).losslessVote(reportId, false);
  await env.lssGovernance
    .connect(adr.lerc20Admin)
    .tokenOwnersVote(reportId, false);
  await env.lssGovernance
    .connect(adr.member1)
    .committeeMemberVote(reportId, false);
  await env.lssGovernance
    .connect(adr.member2)
    .committeeMemberVote(reportId, false);
  await env.lssGovernance
    .connect(adr.member3)
    .committeeMemberVote(reportId, false);
  await env.lssGovernance
    .connect(adr.member4)
    .committeeMemberVote(reportId, false);
};

describe(scriptName, () => {
  beforeEach(async () => {
    adr = await setupAddresses();
    env = await setupEnvironment(
      adr.lssAdmin,
      adr.lssRecoveryAdmin,
      adr.lssPauseAdmin,
      adr.lssInitialHolder,
      adr.lssBackupAdmin,
    );
    lerc20Token = await setupToken(
      2000000,
      'Random Token',
      'RAND',
      adr.lerc20InitialHolder,
      adr.lerc20Admin.address,
      adr.lerc20BackupAdmin.address,
      Number(time.duration.days(1)),
      env.lssController.address,
    );
    reportedToken = await setupToken(
      2000000,
      'Reported Token',
      'REPORT',
      adr.lerc20InitialHolder,
      adr.regularUser5.address,
      adr.lerc20BackupAdmin.address,
      Number(time.duration.days(1)),
      env.lssController.address,
    );

    await env.lssController
      .connect(adr.lssAdmin)
      .setWhitelist([env.lssReporting.address], true);
    await env.lssController
      .connect(adr.lssAdmin)
      .setDexList([adr.dexAddress.address], true);

    await env.lssGovernance
      .connect(adr.lssAdmin)
      .addCommitteeMembers([
        adr.member1.address,
        adr.member2.address,
        adr.member3.address,
        adr.member4.address,
      ]);

    await env.lssToken
      .connect(adr.lssInitialHolder)
      .transfer(adr.reporter1.address, env.stakingAmount * 3);
    await lerc20Token
      .connect(adr.lerc20InitialHolder)
      .transfer(adr.maliciousActor1.address, 1000);
    await lerc20Token
      .connect(adr.lerc20InitialHolder)
      .transfer(reportedToken.address, 1000);

    await env.lssToken
      .connect(adr.reporter1)
      .approve(env.lssReporting.address, env.stakingAmount * 3);

    await ethers.provider.send('evm_increaseTime', [
      Number(time.duration.minutes(5)),
    ]);

    await env.lssReporting
      .connect(adr.reporter1)
      .report(lerc20Token.address, adr.maliciousActor1.address);
    await env.lssReporting
      .connect(adr.reporter1)
      .report(lerc20Token.address, reportedToken.address);
  });

  describe('when everyone votes negatively', () => {
    beforeEach(async () => {
      const response = await env.lssReporting
        .connect(adr.reporter1)
        .reportCount();
      const reportNumber = response.toNumber();

      for (let i = 1; i <= reportNumber; i += 1) {
        everyoneVoteNegative(i);
      }
    });

    it('should let reported address retrieve compensation', async () => {
      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker1.address, env.stakingAmount + env.stakingAmount);
      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker2.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker3.address, env.stakingAmount * 2);

      await env.lssToken
        .connect(adr.staker1)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.staker2)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.staker3)
        .approve(env.lssStaking.address, env.stakingAmount * 2);

      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssStaking.connect(adr.staker1).stake(1);
      await env.lssStaking.connect(adr.staker2).stake(1);
      await env.lssStaking.connect(adr.staker3).stake(1);

      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(1);

      expect(await env.lssGovernance.isReportSolved(1)).to.be.equal(true);

      expect(await env.lssGovernance.reportResolution(1)).to.be.equal(false);

      await expect(
        env.lssGovernance.connect(adr.maliciousActor1).retrieveCompensation(),
      )
        .to.emit(env.lssGovernance, 'CompensationRetrieval')
        .withArgs(adr.maliciousActor1.address, 20);

      const compensationPercentage =
        await env.lssGovernance.compensationPercentage();

      expect(
        await env.lssToken.balanceOf(adr.maliciousActor1.address),
      ).to.be.equal((env.reportingAmount * compensationPercentage) / 100);
    });

    it('should revert if tries to retrieve twice', async () => {
      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker1.address, env.stakingAmount + env.stakingAmount);
      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker2.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker3.address, env.stakingAmount * 2);

      await env.lssToken
        .connect(adr.staker1)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.staker2)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.staker3)
        .approve(env.lssStaking.address, env.stakingAmount * 2);

      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssStaking.connect(adr.staker1).stake(1);
      await env.lssStaking.connect(adr.staker2).stake(1);
      await env.lssStaking.connect(adr.staker3).stake(1);

      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(1);

      expect(await env.lssGovernance.isReportSolved(1)).to.be.equal(true);

      expect(await env.lssGovernance.reportResolution(1)).to.be.equal(false);

      await expect(
        env.lssGovernance.connect(adr.maliciousActor1).retrieveCompensation(),
      ).to.not.be.reverted;

      await expect(
        env.lssGovernance.connect(adr.maliciousActor1).retrieveCompensation(),
      ).to.be.revertedWith('LSS: Already retrieved');
    });

    it('should revert if other than the afflicted tries to retrieve', async () => {
      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker1.address, env.stakingAmount + env.stakingAmount);
      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker2.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker3.address, env.stakingAmount * 2);

      await env.lssToken
        .connect(adr.staker1)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.staker2)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.staker3)
        .approve(env.lssStaking.address, env.stakingAmount * 2);

      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssStaking.connect(adr.staker1).stake(1);
      await env.lssStaking.connect(adr.staker2).stake(1);
      await env.lssStaking.connect(adr.staker3).stake(1);

      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(1);

      expect(await env.lssGovernance.isReportSolved(1)).to.be.equal(true);

      expect(await env.lssGovernance.reportResolution(1)).to.be.equal(false);

      await expect(
        env.lssGovernance.connect(adr.regularUser1).retrieveCompensation(),
      ).to.be.revertedWith('LSS: No retribution assigned');
    });

    it('should revert if called by other than the governance contract', async () => {
      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker1.address, env.stakingAmount + env.stakingAmount);
      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker2.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.lssInitialHolder)
        .transfer(adr.staker3.address, env.stakingAmount * 2);

      await env.lssToken
        .connect(adr.staker1)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.staker2)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken
        .connect(adr.staker3)
        .approve(env.lssStaking.address, env.stakingAmount * 2);

      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssStaking.connect(adr.staker1).stake(1);
      await env.lssStaking.connect(adr.staker2).stake(1);
      await env.lssStaking.connect(adr.staker3).stake(1);

      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(1);

      expect(await env.lssGovernance.isReportSolved(1)).to.be.equal(true);

      expect(await env.lssGovernance.reportResolution(1)).to.be.equal(false);

      await expect(
        env.lssReporting
          .connect(adr.regularUser1)
          .retrieveCompensation(adr.regularUser1.address, 200),
      ).to.be.revertedWith('LSS: Lss SC only');
    });

    describe.only('when reported address was smart contract', () => {
      beforeEach(async () => {
        const MockTokenHolder = await ethers.getContractFactory(
          'MockTokenHolder',
        );
        mockHolderContract = await MockTokenHolder.deploy();
        await lerc20Token
          .connect(adr.lerc20InitialHolder)
          .transfer(mockHolderContract.address, 1000);
        await env.lssReporting
          .connect(adr.reporter1)
          .report(lerc20Token.address, mockHolderContract.address);

        const response = await env.lssReporting
          .connect(adr.reporter1)
          .reportCount();
        mockContractReportId = response.toNumber();

        await ethers.provider.send('evm_increaseTime', [
          Number(time.duration.minutes(5)),
        ]);

        await env.lssToken
          .connect(adr.lssInitialHolder)
          .transfer(adr.staker1.address, env.stakingAmount + env.stakingAmount);
        await env.lssToken
          .connect(adr.lssInitialHolder)
          .transfer(adr.staker2.address, env.stakingAmount * 2);
        await env.lssToken
          .connect(adr.lssInitialHolder)
          .transfer(adr.staker3.address, env.stakingAmount * 2);

        await env.lssToken
          .connect(adr.staker1)
          .approve(env.lssStaking.address, env.stakingAmount * 2);
        await env.lssToken
          .connect(adr.staker2)
          .approve(env.lssStaking.address, env.stakingAmount * 2);
        await env.lssToken
          .connect(adr.staker3)
          .approve(env.lssStaking.address, env.stakingAmount * 2);

        await ethers.provider.send('evm_increaseTime', [
          Number(time.duration.minutes(5)),
        ]);

        await env.lssStaking.connect(adr.staker1).stake(mockContractReportId);
        await env.lssStaking.connect(adr.staker2).stake(mockContractReportId);
        await env.lssStaking.connect(adr.staker3).stake(mockContractReportId);

        await everyoneVoteNegative(mockContractReportId);
        await env.lssGovernance
          .connect(adr.lssAdmin)
          .resolveReport(mockContractReportId);
      });
      it('should be resolved negatively ', async () => {
        expect(
          await env.lssGovernance.isReportSolved(mockContractReportId),
          'should be resolved',
        ).to.be.equal(true);

        expect(
          await env.lssGovernance.reportResolution(mockContractReportId),
          'resolution should be false',
        ).to.be.equal(false);
      });
      it('should let retrieve compensation on behalf of an address', async () => {
        await expect(
          env.lssGovernance
            .connect(adr.lssAdmin)
            .setCompensationWallet(
              mockHolderContract.address,
              adr.regularUser1.address,
            ),
        )
          .to.emit(env.lssGovernance, 'CompensationWalletChanged')
          .withArgs(mockHolderContract.address, adr.regularUser1.address);

        const balanceBefore = await env.lssToken
          .balanceOf(adr.regularUser1.address)
          .then((balance) => balance.toNumber());

        await expect(
          env.lssGovernance
            .connect(adr.regularUser1)
            .recieveCompensationOnBehalf(mockHolderContract.address),
        )
          .to.emit(env.lssGovernance, 'CompensationRetrievalOnBehalf')
          .withArgs(mockHolderContract.address, adr.regularUser1.address, 20);

        const compensationPercentage =
          await env.lssGovernance.compensationPercentage();

        expect(
          await env.lssToken.balanceOf(adr.regularUser1.address),
        ).to.be.equal(
          balanceBefore + (env.reportingAmount * compensationPercentage) / 100,
        );
      });
      it('should not let retrieve compensation on behalf of smart contract if not approved', async () => {
        await expect(
          env.lssGovernance
            .connect(adr.lssAdmin)
            .setCompensationWallet(
              mockHolderContract.address,
              adr.regularUser1.address,
            ),
        )
          .to.emit(env.lssGovernance, 'CompensationWalletChanged')
          .withArgs(mockHolderContract.address, adr.regularUser1.address);

        const balanceBefore = await env.lssToken
          .balanceOf(adr.regularUser2.address)
          .then((balance) => balance.toNumber());

        await expect(
          env.lssGovernance
            .connect(adr.regularUser2)
            .recieveCompensationOnBehalf(mockHolderContract.address),
        ).to.be.revertedWith(
          'LSS: Not authorized to recieve compensation on behalf',
        );

        expect(
          await env.lssToken.balanceOf(adr.regularUser2.address),
        ).to.be.equal(balanceBefore);
      });
      it('should let smart contracts to recieve compensation', async () => {
        await expect(
          mockHolderContract
            .connect(adr.lerc20InitialHolder)
            .claimCompensation(env.lssGovernance.address),
          'claim compensation failed',
        )
          .to.emit(env.lssGovernance, 'CompensationRetrieval')
          .withArgs(mockHolderContract.address, 20);

        const compensationPercentage =
          await env.lssGovernance.compensationPercentage();

        expect(
          await env.lssToken.balanceOf(mockHolderContract.address),
          'balance should be correct',
        ).to.be.equal((env.reportingAmount * compensationPercentage) / 100);
      });

    describe('when erroneusly reported twice', () => {
      beforeEach(async () => {
        await env.lssGovernance.connect(adr.lssAdmin).losslessVote(1, false);
        await env.lssGovernance
          .connect(adr.lerc20Admin)
          .tokenOwnersVote(1, false);
        await env.lssGovernance
          .connect(adr.member1)
          .committeeMemberVote(1, false);
        await env.lssGovernance
          .connect(adr.member2)
          .committeeMemberVote(1, false);
        await env.lssGovernance
          .connect(adr.member3)
          .committeeMemberVote(1, false);
        await env.lssGovernance
          .connect(adr.member4)
          .committeeMemberVote(1, false);

        await env.lssGovernance.connect(adr.lssAdmin).resolveReport(1);

        await expect(
          env.lssGovernance.connect(adr.maliciousActor1).retrieveCompensation(),
        )
          .to.emit(env.lssGovernance, 'CompensationRetrieval')
          .withArgs(adr.maliciousActor1.address, 20);

        await env.lssReporting
          .connect(adr.reporter1)
          .report(lerc20Token.address, adr.maliciousActor1.address);

        await env.lssGovernance.connect(adr.lssAdmin).losslessVote(3, false);
        await env.lssGovernance
          .connect(adr.lerc20Admin)
          .tokenOwnersVote(3, false);
        await env.lssGovernance
          .connect(adr.member1)
          .committeeMemberVote(3, false);
        await env.lssGovernance
          .connect(adr.member2)
          .committeeMemberVote(3, false);
        await env.lssGovernance
          .connect(adr.member3)
          .committeeMemberVote(3, false);
        await env.lssGovernance
          .connect(adr.member4)
          .committeeMemberVote(3, false);

        await env.lssGovernance.connect(adr.lssAdmin).resolveReport(3);
      });

      it('should let the address retrieve compensation twice', async () => {
        await expect(
          env.lssGovernance.connect(adr.maliciousActor1).retrieveCompensation(),
        )
          .to.emit(env.lssGovernance, 'CompensationRetrieval')
          .withArgs(adr.maliciousActor1.address, 20);
      });
    });
  });
});
