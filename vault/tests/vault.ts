require("dotenv").config({ path: __dirname + `/../.env` });
import * as anchor from "@project-serum/anchor";
import { Vault } from "../target/types/vault";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import assert from "assert";
import { sleep, IVaultBumps, IEpochTimes } from "./utils";
import {
  Exchange,
  Network,
  utils as zetaUtils,
  types,
  constants,
} from "@zetamarkets/sdk";
import { mintUsdc, getClosestMarket, jetMetadata } from "./utils";

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
  let vaultMargin;

  it("Initializes the state of the world", async () => {
    // Load Zeta SDK exchange object which has all the info one might need
    await Exchange.load(
      zetaProgram,
      Network.DEVNET,
      provider.connection,
      zetaUtils.defaultCommitment(),
      undefined,
      0
    );

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

  let vault: anchor.web3.PublicKey,
    vaultBump,
    vaultAuthority,
    vaultAuthorityBump,
    mintAuthority,
    mintAuthorityBump,
    redeemableMint,
    redeemableMintAccount,
    redeemableMintBump,
    vaultUsdc,
    vaultUsdcBump,
    userRedeemable,
    userRedeemableBump,
    secondUserRedeemable,
    secondUserRedeemableBump,
    bumps: IVaultBumps,
    epochTimes: IEpochTimes;

  it("Initializes the vault", async () => {
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

    // Doubt I'm supplying the right bump here
    [mintAuthority, mintAuthorityBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("mint-authority"), Buffer.from(vaultName)],
        new anchor.web3.PublicKey(`Fx1bCAyYpLMPVAjfq1pxbqKKkvDR3iYEpam1KbThRDYQ`)
      );

    [vaultAuthority, vaultAuthorityBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("vault-authority")],
        program.programId
      );

    let vaultLamports = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL * 0.1);

    bumps = {
      vault: vaultBump,
      vaultAuthority: vaultAuthorityBump,
      mintAuthority: mintAuthorityBump,
      redeemableMint: redeemableMintBump,
      vaultUsdc: vaultUsdcBump,
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

    console.log("about to init vault")
    await program.rpc.initializeVault(
      vaultName,
      vaultLamports,
      bumps,
      epochTimes,
      {
        accounts: {
          vaultAdmin: vaultAdmin.publicKey,
          vault,
          mintAuthority,
          vaultAuthority,
          usdcMint,
          redeemableMint,
          vaultUsdc,
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
    assert.equal(vaultAuthorityAccount.lamports, vaultLamports.toNumber());
    // USDC in vault == 0
    let vaultUsdcAccount = await usdcMintAccount.getAccountInfo(vaultUsdc);
    assert.equal(vaultUsdcAccount.amount.toNumber(), 0);
    // Redeemable tokens minted == 0
    let redeemableMintInfo = await redeemableMintAccount.getMintInfo();
    assert.equal(redeemableMintInfo.supply.toNumber(), 0);
  });

  let userUsdc;
  const firstDeposit = 40;

  it("Exchanges user USDC for redeemable tokens", async () => {
    // Wait until the vault has opened.
    if (Date.now() < epochTimes.startEpoch.toNumber() * 1000) {
      await sleep(epochTimes.startEpoch.toNumber() * 1000 - Date.now() + 2000);
    }

    userUsdc = await usdcMintAccount.createAssociatedTokenAccount(
      userKeypair.publicKey
    );

    // Mint USDC to user USDC wallet
    console.log("Minting USDC to User 1");
    await mintUsdc(userKeypair.publicKey, firstDeposit);

    // Check if we inited correctly
    let userUsdcAccount = await usdcMintAccount.getAccountInfo(userUsdc);

    assert.equal(
      zetaUtils.convertNativeBNToDecimal(userUsdcAccount.amount),
      firstDeposit
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

    await program.rpc.depositVault(
      userRedeemableBump,
      new anchor.BN(zetaUtils.convertDecimalToNativeInteger(firstDeposit)),
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
          tokenProgram: TOKEN_PROGRAM_ID,
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
      zetaUtils.convertNativeBNToDecimal(vaultUsdcAccount.amount),
      firstDeposit
    );
    let userRedeemableAccount = await redeemableMintAccount.getAccountInfo(
      userRedeemable
    );
    assert.equal(
      zetaUtils.convertNativeBNToDecimal(userRedeemableAccount.amount),
      firstDeposit
    );
  });

  const secondDeposit = 420;
  let totalVaultUsdc, secondUserKeypair, secondUserUsdc;

  it("Exchanges a second users USDC for redeemable tokens", async () => {
    secondUserKeypair = anchor.web3.Keypair.generate();

    const transferTransaction = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: vaultAdmin.publicKey,
        lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL, // 0.1 SOL
        toPubkey: secondUserKeypair.publicKey,
      })
    );
    await anchor.web3.sendAndConfirmTransaction(
      provider.connection,
      transferTransaction,
      [vaultAdmin]
    );
    secondUserUsdc = await usdcMintAccount.createAssociatedTokenAccount(
      secondUserKeypair.publicKey
    );
    console.log("Minting USDC to User 2");
    await mintUsdc(secondUserKeypair.publicKey, secondDeposit);

    // Checking the transfer went through
    let secondUserUsdcAccount = await usdcMintAccount.getAccountInfo(
      secondUserUsdc
    );
    assert.equal(
      zetaUtils.convertNativeBNToDecimal(secondUserUsdcAccount.amount),
      secondDeposit
    );

    [secondUserRedeemable, secondUserRedeemableBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("user-redeemable"),
          Buffer.from(vaultName),
          secondUserKeypair.publicKey.toBuffer(),
        ],
        program.programId
      );

    await program.rpc.depositVault(
      secondUserRedeemableBump,
      new anchor.BN(zetaUtils.convertDecimalToNativeInteger(secondDeposit)),
      {
        accounts: {
          userAuthority: secondUserKeypair.publicKey,
          userUsdc: secondUserUsdc,
          userRedeemable: secondUserRedeemable,
          vault,
          vaultAuthority,
          usdcMint,
          redeemableMint,
          vaultUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [
          program.instruction.initializeUserRedeemableTokenAccount({
            accounts: {
              userAuthority: secondUserKeypair.publicKey,
              userRedeemable: secondUserRedeemable,
              vault,
              vaultAuthority,
              redeemableMint,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
          }),
        ],
        signers: [secondUserKeypair],
      }
    );

    totalVaultUsdc = firstDeposit + secondDeposit;
    let vaultUsdcAccount = await usdcMintAccount.getAccountInfo(vaultUsdc);
    assert.equal(
      zetaUtils.convertNativeBNToDecimal(vaultUsdcAccount.amount),
      totalVaultUsdc
    );
    let secondUserRedeemableAccount =
      await redeemableMintAccount.getAccountInfo(secondUserRedeemable);
    assert.equal(
      zetaUtils.convertNativeBNToDecimal(secondUserRedeemableAccount.amount),
      secondDeposit
    );
  });

  // Withdraw Phase

  const firstWithdrawal = 2;

  it("Exchanges user Redeemable tokens for USDC", async () => {
    if (Date.now() < epochTimes.startEpoch.toNumber() * 1000) {
      await sleep(epochTimes.startEpoch.toNumber() * 1000 - Date.now() + 3000);
    }
    await program.rpc.withdrawVault(
      userRedeemableBump,
      new anchor.BN(zetaUtils.convertDecimalToNativeInteger(firstWithdrawal)),
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
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [userKeypair],
      }
    );

    totalVaultUsdc = totalVaultUsdc - firstWithdrawal;
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

  // Closes the account subscriptions so the test won't hang.
  it("BOILERPLATE: Close websockets.", async () => {
    await Exchange.close();
  });
});
