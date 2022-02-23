require("dotenv").config({ path: __dirname + `/../.env` });
import * as anchor from "@project-serum/anchor";
import { Vault } from "../target/types/vault";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import assert from "assert";
import { sleep, IVaultBumps, IDepositVaultBumps, IEpochTimes, IWithdrawVaultBumps } from "./utils";
import {
  Network,
  utils as zetaUtils,
  constants,
} from "@zetamarkets/sdk";
import { buildFaucetAirdropIx, jetMetadata } from "./utils";

describe("vault", () => {
  const vaultAdmin = anchor.web3.Keypair.generate();
  const userKeypair = anchor.web3.Keypair.generate();
  console.log(vaultAdmin.publicKey.toString());
  console.log(userKeypair.publicKey.toString());

  // Configure the client to use the local cluster.
  const url = "https://api.devnet.solana.com";
  if (url === undefined) {
    throw new Error("ANCHOR_PROVIDER_URL is not defined");
  }
  const connection = new anchor.web3.Connection(
    url,
    zetaUtils.defaultCommitment()
  );
  const provider = new anchor.Provider(
    connection,
    new anchor.Wallet(userKeypair),
    zetaUtils.defaultCommitment()
  );
  anchor.setProvider(provider);
  const publicConnection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    zetaUtils.defaultCommitment()
  );

  const program = anchor.workspace.Vault as anchor.Program<Vault>;
  const zetaProgram = new anchor.web3.PublicKey(process.env!.zeta_program);

  const pythOracle = constants.PYTH_PRICE_FEEDS[Network.DEVNET]["SOL/USD"];

  // These are all of the variables we assume exist in the world already and
  // are available to the client.
  let usdcMintAccount: Token;
  let usdcMint: anchor.web3.PublicKey;

  let vault: anchor.web3.PublicKey,
    vaultBump,
    vaultAuthority,
    vaultAuthorityBump,
    redeemableMint,
    redeemableMintAccount,
    redeemableMintBump,
    vaultUsdc,
    vaultUsdcBump,
    market,
    reserve,
    obligationPda,
    obligationPdaBump,
    userRedeemable,
    userRedeemableBump,
    secondUserRedeemable,
    secondUserRedeemableBump,
    depositAccountPda,
    depositAccountPdaBump,
    collateralAccountPda,
    collateralAccountPdaBump,
    loanAccountPda,
    loanAccountPdaBump,
    bumps: IVaultBumps,
    epochTimes: IEpochTimes;

  it("Initializes the state of the world for jet USDC", async () => {

    // Airdrop some SOL to the vault authority
    await publicConnection.confirmTransaction(
      await publicConnection.requestAirdrop(
        vaultAdmin.publicKey,
        1.0 * anchor.web3.LAMPORTS_PER_SOL // 1 SOL
      ),
      "confirmed"
    );
    console.log("SOL Airdrop to vault admin completed");

    const solTransferTransaction = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: vaultAdmin.publicKey,
        lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL, // 0.1 SOL
        toPubkey: userKeypair.publicKey,
      })
    );
    await anchor.web3.sendAndConfirmTransaction(
      provider.connection,
      solTransferTransaction,
      [vaultAdmin]
    );

    console.log("getting token mint", jetMetadata.reserves[0].accounts.tokenMint)
    usdcMint = new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.tokenMint)
    console.log(`usdmint ${usdcMint}`)
    usdcMintAccount = new Token(
      provider.connection,
      usdcMint,
      TOKEN_PROGRAM_ID,
      (provider.wallet as anchor.Wallet).payer
    );
  });

  // These are all variables the client will need to create in order to
  // initialize the vault
  // TODO: remove this - for purposes of creating unique testing vaults
  const vaultName = "test_vault_" + Math.random().toString(16).substring(2, 8); // "sol_put_sell";
  console.log(`Vault name: ${vaultName}`);

  it("Initializes the vault", async () => {
    console.log("buffer ", Buffer.from(vaultName));
    [vault, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(vaultName)],
      program.programId
    );

    [redeemableMint, redeemableMintBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("redeemable-mint"), Buffer.from(vaultName)],
        program.programId
      );


    [vaultUsdc, vaultUsdcBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault-usdc"), Buffer.from(vaultName)],
      program.programId
    );

    [vaultAuthority, vaultAuthorityBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("vault-authority"), Buffer.from(vaultName)],
        program.programId
      );
    
    market = new anchor.web3.PublicKey(jetMetadata.market.market),

    reserve = new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.reserve),

    [obligationPda, obligationPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('obligation'), market.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

    [depositAccountPda, depositAccountPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('deposits'), reserve.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

    [collateralAccountPda, collateralAccountPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('collateral'), reserve.toBuffer(), obligationPda.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );
    
    [loanAccountPda, loanAccountPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('loan'), reserve.toBuffer(), obligationPda.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

    let vaultLamports = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL * 0.1);

    bumps = {
      vault: vaultBump,
      vaultAuthority: vaultAuthorityBump,
      redeemableMint: redeemableMintBump,
      vaultUsdc: vaultUsdcBump,
      obligation: obligationPdaBump,
      depositAccount: depositAccountPdaBump,
      collateralAccount: collateralAccountPdaBump,
      loanAccount: loanAccountPdaBump
    };

    const nowBn = new anchor.BN(Date.now() / 1000);
    epochTimes = {
      startEpoch: nowBn.add(new anchor.BN(4)),
      endDeposits: nowBn.add(new anchor.BN(22)),
      startAuction: nowBn.add(new anchor.BN(24)),
      endAuction: nowBn.add(new anchor.BN(26)),
      startSettlement: nowBn.add(new anchor.BN(28)),
      endEpoch: nowBn.add(new anchor.BN(30)),
      epochCadence: new anchor.BN(40), // seconds
    };
    console.log("TOKEN_PROGRAM_ID",TOKEN_PROGRAM_ID.toBase58())

    console.log(`about to init vault w/ ${usdcMint} as usdc mint`)
    await program.rpc.initializeVault(
      vaultName,
      vaultLamports,
      bumps,
      epochTimes,
      {
        accounts: {
          vaultAdmin: vaultAdmin.publicKey,
          vault,
          vaultAuthority,
          usdcMint,
          depositNoteMint:  new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.depositNoteMint),
          market: new anchor.web3.PublicKey(jetMetadata.market.market),
          loanNoteMint: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.loanNoteMint),
          obligation: obligationPda,
          marketAuthority: new anchor.web3.PublicKey(jetMetadata.market.marketAuthority),
          redeemableMint,
          vaultUsdc,
          depositAccount: depositAccountPda,
          collateralAccount: collateralAccountPda,
          loanAccount: loanAccountPda,
          reserve: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.reserve),
          jetProgram: new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")          ,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [vaultAdmin],
      }
    );
    console.log("init vault")

    redeemableMintAccount = new Token(
      provider.connection,
      redeemableMint,
      TOKEN_PROGRAM_ID,
      vaultAdmin
    );

    // SOL balance for vault authority PDA is `vaultLamports`
    let vaultAuthorityAccount = await provider.connection.getAccountInfo(
      vaultAuthority
    );
    assert.notEqual(vaultAuthorityAccount.lamports, vaultLamports.toNumber());
    // USDC in vault == 0
    let vaultUsdcAccount = await usdcMintAccount.getAccountInfo(vaultUsdc);
    assert.equal(vaultUsdcAccount.amount.toNumber(), 0);
    // Redeemable tokens minted == 0
    let redeemableMintInfo = await redeemableMintAccount.getMintInfo();
    assert.equal(redeemableMintInfo.supply.toNumber(), 0);
  });

  let userUsdc: anchor.web3.PublicKey;
  const firstDeposit = 4000;

  it("Deposits user USDC in exchange for redeemable tokens", async () => {
    // Wait until the vault has opened.
    if (Date.now() < epochTimes.startEpoch.toNumber() * 1000) {
      await sleep(epochTimes.startEpoch.toNumber() * 1000 - Date.now() + 1000);
    }

    userUsdc = await usdcMintAccount.createAssociatedTokenAccount(
      userKeypair.publicKey
    );

    const instructions = [];  
    const mintFakeUsdcIx = await buildFaucetAirdropIx(
      new anchor.BN(firstDeposit),
      new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.tokenMint),
      userUsdc,
      new anchor.web3.PublicKey('9BADYvZDaFBsGbeQEGeTQ9jBopLtd9fTKrycdjBXm7mZ')
    )

    instructions.push(mintFakeUsdcIx);

    const transaction = new anchor.web3.Transaction().add(...instructions);

    transaction.feePayer = userKeypair.publicKey;
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    await provider.send(transaction);

    let userUsdcAccount = await usdcMintAccount.getAccountInfo(userUsdc);

    assert.equal(
      userUsdcAccount.amount,
      new anchor.BN(firstDeposit).toNumber()
    );

    [userRedeemable, userRedeemableBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("user-redeemable"),
          Buffer.from(vaultName),
          userKeypair.publicKey.toBuffer(),
        ],
        program.programId
      );


    [depositAccountPda, depositAccountPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('deposits'), reserve.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

    [obligationPda, obligationPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('obligation'), market.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

    [loanAccountPda, loanAccountPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('loan'), reserve.toBuffer(), obligationPda.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

    [collateralAccountPda, collateralAccountPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('collateral'), reserve.toBuffer(), obligationPda.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

      console.log("userRedeemable", userRedeemable)


    const depositVaultBumps: IDepositVaultBumps = {
      loanAccount: loanAccountPdaBump,
      depositAccount: depositAccountPdaBump,
      userRedeemableAccount: userRedeemableBump,
      collateralAccount: collateralAccountPdaBump,
      obligation: obligationPdaBump
    }

    await program.rpc.depositVault(
      depositVaultBumps,
      new anchor.BN(firstDeposit),
      {
        accounts: {
          userAuthority: userKeypair.publicKey,
          userUsdc,
          userRedeemable,
          vault,
          vaultAuthority,
          usdcMint,
          redeemableMint,
          vaultUsdc,
          loanAccount: loanAccountPda,
          collateralAccount: collateralAccountPda,
          obligation: obligationPda,
          loanNoteMint: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.loanNoteMint),
          jetVault: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.vault),
          market: new anchor.web3.PublicKey(jetMetadata.market.market),
          depositNoteMint: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.depositNoteMint),
          depositAccount: depositAccountPda,
          feeNoteVault: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.feeNoteVault),
          pythPriceOracle: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.pythPrice),
          marketAuthority: new anchor.web3.PublicKey(jetMetadata.market.marketAuthority),
          reserve: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.reserve),
          tokenProgram: TOKEN_PROGRAM_ID,
          jetProgram: new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")          ,
        },
        instructions: [
          program.instruction.initializeUserRedeemableTokenAccount({
            accounts: {
              userAuthority: userKeypair.publicKey,
              userRedeemable,
              vault,
              vaultAuthority,
              redeemableMint,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
          }),
        ],
        signers: [userKeypair],
      }
    );


    // Check that USDC is in vault and user has received their redeem tokens in return
    let vaultUsdcAccount = await usdcMintAccount.getAccountInfo(vaultUsdc);
    assert.equal(
      vaultUsdcAccount.amount,
      firstDeposit*.6
    );
    let userRedeemableAccount = await redeemableMintAccount.getAccountInfo(
      userRedeemable
    );
    assert.equal(
      userRedeemableAccount.amount,
      firstDeposit
    );
  });

  // const secondDeposit = 420;
  let totalVaultUsdc, secondUserKeypair, secondUserUsdc;

  // it("Exchanges a second users USDC for redeemable tokens", async () => {
  //   secondUserKeypair = anchor.web3.Keypair.generate();

  //   const transferTransaction = new anchor.web3.Transaction().add(
  //     anchor.web3.SystemProgram.transfer({
  //       fromPubkey: vaultAdmin.publicKey,
  //       lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL, // 0.1 SOL
  //       toPubkey: secondUserKeypair.publicKey,
  //     })
  //   );
  //   await anchor.web3.sendAndConfirmTransaction(
  //     provider.connection,
  //     transferTransaction,
  //     [vaultAdmin]
  //   );
  //   secondUserUsdc = await usdcMintAccount.createAssociatedTokenAccount(
  //     secondUserKeypair.publicKey
  //   );
  //   console.log("Minting USDC to User 2");
  //   await mintUsdc(secondUserKeypair.publicKey, secondDeposit);

  //   // Checking the transfer went through
  //   let secondUserUsdcAccount = await usdcMintAccount.getAccountInfo(
  //     secondUserUsdc
  //   );
  //   assert.equal(
  //     zetaUtils.convertNativeBNToDecimal(secondUserUsdcAccount.amount),
  //     secondDeposit
  //   );

  //   [secondUserRedeemable, secondUserRedeemableBump] =
  //     await anchor.web3.PublicKey.findProgramAddress(
  //       [
  //         Buffer.from("user-redeemable"),
  //         Buffer.from(vaultName),
  //         secondUserKeypair.publicKey.toBuffer(),
  //       ],
  //       program.programId
  //     );

  //   await program.rpc.depositVault(
  //     secondUserRedeemableBump,
  //     new anchor.BN(zetaUtils.convertDecimalToNativeInteger(secondDeposit)),
  //     {
  //       accounts: {
  //         userAuthority: secondUserKeypair.publicKey,
  //         userUsdc: secondUserUsdc,
  //         userRedeemable: secondUserRedeemable,
  //         vault,
  //         vaultAuthority,
  //         usdcMint,
  //         redeemableMint,
  //         vaultUsdc,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //       },
  //       instructions: [
  //         program.instruction.initializeUserRedeemableTokenAccount({
  //           accounts: {
  //             userAuthority: secondUserKeypair.publicKey,
  //             userRedeemable: secondUserRedeemable,
  //             vault,
  //             vaultAuthority,
  //             redeemableMint,
  //             systemProgram: anchor.web3.SystemProgram.programId,
  //             tokenProgram: TOKEN_PROGRAM_ID,
  //             rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //           },
  //         }),
  //       ],
  //       signers: [secondUserKeypair],
  //     }
  //   );

  //   totalVaultUsdc = firstDeposit + secondDeposit;
  //   let vaultUsdcAccount = await usdcMintAccount.getAccountInfo(vaultUsdc);
  //   assert.equal(
  //     zetaUtils.convertNativeBNToDecimal(vaultUsdcAccount.amount),
  //     totalVaultUsdc
  //   );
  //   let secondUserRedeemableAccount =
  //     await redeemableMintAccount.getAccountInfo(secondUserRedeemable);
  //   assert.equal(
  //     zetaUtils.convertNativeBNToDecimal(secondUserRedeemableAccount.amount),
  //     secondDeposit
  //   );
  // });

  // // Withdraw Phase

  const firstWithdrawal = 4000;

  it("Exchanges user Redeemable tokens for USDC", async () => {
    if (Date.now() < epochTimes.startEpoch.toNumber() * 1000) {
      await sleep(epochTimes.startEpoch.toNumber() * 1000 - Date.now() + 1000);
    }

    [userRedeemable, userRedeemableBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("user-redeemable"),
          Buffer.from(vaultName),
          userKeypair.publicKey.toBuffer(),
        ],
        program.programId
      );

    [depositAccountPda, depositAccountPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('deposits'), reserve.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

    [obligationPda, obligationPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('obligation'), market.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

    [loanAccountPda, loanAccountPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('loan'), reserve.toBuffer(), obligationPda.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

    [collateralAccountPda, collateralAccountPdaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from('collateral'), reserve.toBuffer(), obligationPda.toBuffer(), vaultAuthority.toBuffer()],
        new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
      );

    const withdrawVaultBumps : IWithdrawVaultBumps = {
      loanAccount: loanAccountPdaBump,
      depositAccount: depositAccountPdaBump,
      collateralAccount: collateralAccountPdaBump,
      userRedeemableAccount: userRedeemableBump,
      obligation: obligationPdaBump
    }
    console.log("token program", TOKEN_PROGRAM_ID.toString())
    // console.log("jet program", jetProgram)


    await program.rpc.withdrawVault(
      withdrawVaultBumps,
      new anchor.BN(firstWithdrawal),
      {
        accounts: {
          userAuthority: userKeypair.publicKey,
          userUsdc,
          userRedeemable,
          vault,
          vaultAuthority,
          usdcMint,
          redeemableMint,
          vaultUsdc,
          //Jet PDAs
          obligation: obligationPda,
          collateralAccount: collateralAccountPda,
          loanAccount: loanAccountPda,
          depositAccount: depositAccountPda,
          //Jet accounts
          depositNoteMint: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.depositNoteMint),
          feeNoteVault: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.feeNoteVault),
          pythPriceOracle: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.pythPrice),
          loanNoteMint: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.loanNoteMint),
          market: new anchor.web3.PublicKey(jetMetadata.market.market),
          jetVault: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.vault),
          reserve: new anchor.web3.PublicKey(jetMetadata.reserves[0].accounts.reserve),
          marketAuthority: new anchor.web3.PublicKey(jetMetadata.market.marketAuthority),
          tokenProgram: TOKEN_PROGRAM_ID,
          jetProgram: new anchor.web3.PublicKey("JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU")
        },
        signers: [userKeypair],
      }
    );

    totalVaultUsdc = firstDeposit - firstWithdrawal;
    let vaultUsdcAccount = await usdcMintAccount.getAccountInfo(vaultUsdc);
    assert.equal(
      zetaUtils.convertNativeBNToDecimal(vaultUsdcAccount.amount),
      totalVaultUsdc
    );
    let userUsdcAccount = await usdcMintAccount.getAccountInfo(userUsdc);
    assert.equal(
      zetaUtils.convertNativeBNToDecimal(userUsdcAccount.amount),
      firstWithdrawal
    );
  });
});
