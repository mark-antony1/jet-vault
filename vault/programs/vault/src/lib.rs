use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use anchor_spl::token::{self, Burn, CloseAccount, Mint, MintTo, Token, TokenAccount, Transfer};
// use rust_decimal::prelude::*;
use std::ops::Deref;
// use jet::cpi::accounts::{InitializeObligation};
use jet_proto_v1_cpi::{init_obligation, init_deposit_account, init_collateral_account, init_loan_account, deposit, refresh_reserve, borrow, deposit_collateral};
use jet_proto_v1_cpi::accounts::*;
use jet_proto_v1_cpi::{Amount, DepositCollateralBumpSeeds};
use crate::context::*;

pub mod address;
pub mod constants;
pub mod context;
pub mod pyth_client;
use constants::*;

declare_id!("8KFe29BGwPevewGY147ytq2mSGuNVRtM4JaikvF6D26G");

#[program]
pub mod vault {

    // use std::borrow::Borrow;

    use super::*;

    #[access_control(validate_epoch_times(epoch_times))]
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        vault_name: String,
        vault_lamports: u64,
        bumps: VaultBumps,
        epoch_times: EpochTimes,
    ) -> ProgramResult {

        let vault = &mut ctx.accounts.vault;

        {
            let name_bytes = vault_name.as_bytes();
            let mut name_data = [b' '; 20];
            name_data[..name_bytes.len()].copy_from_slice(name_bytes);

            vault.vault_name = name_data;
            vault.bumps = bumps;
            vault.vault_admin = ctx.accounts.vault_admin.key();

            vault.usdc_mint = ctx.accounts.usdc_mint.key();
            vault.redeemable_mint = ctx.accounts.redeemable_mint.key();
            vault.vault_usdc = ctx.accounts.vault_usdc.key();

            vault.epoch_times = epoch_times;
        }
        invoke(
            &system_instruction::transfer(
                &ctx.accounts.vault_admin.key(),
                &ctx.accounts.vault_authority.key(),
                vault_lamports,
            ),
            &[
                ctx.accounts.vault_admin.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        {
            msg!(&ctx.accounts.market.key().to_string());
            let cpi_program = ctx.accounts.jet_program.to_account_info();
            let cpi_accounts = InitializeObligation{
                market: ctx.accounts.market.to_account_info(),
                market_authority: ctx.accounts.market_authority.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                borrower: ctx.accounts.vault_authority.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                obligation: ctx.accounts.obligation.to_account_info(),
            };

            let my_vault_authority_bump = vault.bumps.vault_authority;
            let seeds = &[VAULT_AUTHORITY_SEED.as_bytes(), vault_name.as_bytes(), &[my_vault_authority_bump]];
            let signers = [&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts,&signers);
            init_obligation(cpi_ctx, vault.bumps.obligation)?;
        } 

        {
            let cpi_accounts = InitializeDepositAccount{
                market: ctx.accounts.market.to_account_info(),
                market_authority: ctx.accounts.market_authority.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                depositor: ctx.accounts.vault_authority.to_account_info(),
                deposit_note_mint: ctx.accounts.deposit_note_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                deposit_account: ctx.accounts.deposit_account.to_account_info(),
                reserve: ctx.accounts.reserve.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            };

            let cpi_program = ctx.accounts.jet_program.to_account_info();
            let my_vault_authority_bump = vault.bumps.vault_authority;
            let seeds = &[VAULT_AUTHORITY_SEED.as_bytes(), vault_name.as_bytes(), &[my_vault_authority_bump]];
            let signers = [&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts,&signers);
            init_deposit_account(cpi_ctx, vault.bumps.deposit_account)?;
        }
        
        {
            let cpi_accounts = InitializeCollateralAccount{
                market: ctx.accounts.market.to_account_info(),
                market_authority: ctx.accounts.market_authority.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                owner: ctx.accounts.vault_authority.to_account_info(),
                deposit_note_mint: ctx.accounts.deposit_note_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                obligation: ctx.accounts.obligation.to_account_info(),
                reserve: ctx.accounts.reserve.to_account_info(),
                collateral_account: ctx.accounts.collateral_account.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            };

            let cpi_program = ctx.accounts.jet_program.to_account_info();
            let my_vault_authority_bump = vault.bumps.vault_authority;
            let seeds = &[VAULT_AUTHORITY_SEED.as_bytes(), vault_name.as_bytes(), &[my_vault_authority_bump]];
            let signers = [&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts,&signers);
            init_collateral_account(cpi_ctx, vault.bumps.collateral_account)?;
        }



        let cpi_accounts = InitializeLoanAccount{
            market: ctx.accounts.market.to_account_info(),
            market_authority: ctx.accounts.market_authority.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            owner: ctx.accounts.vault_authority.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            obligation: ctx.accounts.obligation.to_account_info(),
            reserve: ctx.accounts.reserve.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
            loan_account: ctx.accounts.loan_account.to_account_info(),
            loan_note_mint: ctx.accounts.loan_note_mint.to_account_info(),
        };

        let cpi_program = ctx.accounts.jet_program.to_account_info();
        let my_vault_authority_bump = vault.bumps.vault_authority;
        let seeds = &[VAULT_AUTHORITY_SEED.as_bytes(), vault_name.as_bytes(), &[my_vault_authority_bump]];
        let signers = [&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts,&signers);
        init_loan_account(cpi_ctx, vault.bumps.loan_account)
    }

    #[access_control(deposit_withdraw_phase(&ctx.accounts.vault))]
    pub fn initialize_user_redeemable_token_account(
        ctx: Context<InitUserRedeemableTokenAccount>,
    ) -> ProgramResult {
        msg!("Initialize user redeemable token account");
        Ok(())
    }

    #[access_control(deposit_withdraw_phase(&ctx.accounts.vault))]
    pub fn deposit_vault(ctx: Context<DepositVault>, bumps: _DepositVaultBumps, usdc_amount: u64) -> ProgramResult {
        msg!("Deposit into vault");
        // While token::transfer will check this, we prefer a verbose err msg.
        if ctx.accounts.user_usdc.amount < usdc_amount {
            return Err(ErrorCode::InsufficientUsdcBalance.into());
        }

        let vault = &ctx.accounts.vault;

        // Transfer user's USDC to vault USDC account.
        // Calculate USDC tokens due based on the redeem:usdc exchange rate P_z = ( N_u / N_z ).
        // n_u = P_z * n_z
        // If N_z == 0, then set P_z = 1
        let mut redeemable_amount = usdc_amount as u128;
        if (ctx.accounts.redeemable_mint.supply > 0) {
            redeemable_amount = (usdc_amount as u128)
                .checked_mul(ctx.accounts.redeemable_mint.supply as u128)
                .unwrap()
                .checked_div(ctx.accounts.vault_usdc.amount as u128)
                .unwrap();
        }
        token::transfer(
            ctx.accounts.into_transfer_context(),
            redeemable_amount as u64,
        )?;

        // Mint Redeemable to user Redeemable account.
        let vault_name = ctx.accounts.vault.vault_name.as_ref();
        let seeds = vault_authority_seeds!(
            vault_name = vault_name,
            bump = ctx.accounts.vault.bumps.vault_authority
        );
        let signer = &[&seeds[..]];
        token::mint_to(ctx.accounts.into_mint_to_context(signer), usdc_amount)?;

        let cpi_accounts = RefreshReserve{
            deposit_note_mint: ctx.accounts.deposit_note_mint.to_account_info(),
            market: ctx.accounts.market.to_account_info(),
            market_authority: ctx.accounts.market_authority.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            reserve: ctx.accounts.reserve.to_account_info(),
            fee_note_vault: ctx.accounts.fee_note_vault.to_account_info(),
            pyth_oracle_price: ctx.accounts.pyth_price_oracle.to_account_info(),
        };

        let cpi_program = ctx.accounts.jet_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts,signer);
        refresh_reserve(cpi_ctx,)?;

        let cpi_accounts = Deposit{
            deposit_account: ctx.accounts.deposit_account.to_account_info(),
            deposit_note_mint: ctx.accounts.deposit_note_mint.to_account_info(),
            vault: ctx.accounts.jet_vault.to_account_info(),
            market: ctx.accounts.market.to_account_info(),
            market_authority: ctx.accounts.market_authority.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            depositor: ctx.accounts.vault_authority.to_account_info(),
            deposit_source: ctx.accounts.vault_usdc.to_account_info(),
            reserve: ctx.accounts.reserve.to_account_info(),
        };

        let cpi_program = ctx.accounts.jet_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts,signer);
        deposit(cpi_ctx, bumps.deposit_account, Amount::from_tokens(usdc_amount))?;

        let cpi_accounts = DepositCollateral{
            deposit_account: ctx.accounts.deposit_account.to_account_info(),
            obligation: ctx.accounts.obligation.to_account_info(),
            market: ctx.accounts.market.to_account_info(),
            market_authority: ctx.accounts.market_authority.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            owner: ctx.accounts.vault_authority.to_account_info(),
            collateral_account: ctx.accounts.collateral_account.to_account_info(),
            reserve: ctx.accounts.reserve.to_account_info(),
        };

        let cpi_program = ctx.accounts.jet_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts,signer);
        msg!("about to deposit");
        deposit_collateral(cpi_ctx, DepositCollateralBumpSeeds{collateral_account: bumps.collateral_account, deposit_account: bumps.deposit_account}, Amount::from_tokens(usdc_amount))

        // let cpi_accounts = Borrow{
        //     loan_account: ctx.accounts.loan_account.to_account_info(),
        //     loan_note_mint: ctx.accounts.loan_note_mint.to_account_info(),
        //     vault: ctx.accounts.jet_vault.to_account_info(),
        //     receiver_account: ctx.accounts.vault_authority.to_account_info(),
        //     obligation: ctx.accounts.obligation.to_account_info(),
        //     market: ctx.accounts.market.to_account_info(),
        //     market_authority: ctx.accounts.market_authority.to_account_info(),
        //     token_program: ctx.accounts.token_program.to_account_info(),
        //     borrower: ctx.accounts.vault_authority.to_account_info(),
        //     reserve: ctx.accounts.reserve.to_account_info(),
        // };

        // msg!("about to borrow");
        // let cpi_program = ctx.accounts.jet_program.to_account_info();
        // let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts,signer);
        // borrow(cpi_ctx, bumps.loan_account, Amount::from_tokens(usdc_amount))
    }

    #[access_control(deposit_withdraw_phase(&ctx.accounts.vault))]
    pub fn withdraw_vault(
        ctx: Context<WithdrawVault>,
        _bump: u8,
        redeemable_amount: u64,
    ) -> ProgramResult {
        msg!("Withdraw from vault");
        // While token::burn will check this, we prefer a verbose err msg.
        if ctx.accounts.user_redeemable.amount < redeemable_amount {
            return Err(ErrorCode::InsufficientRedeemableBalance.into());
        }

        // Calculate USDC tokens due based on the redeem:usdc exchange rate P_z = ( N_u / N_z ).
        // n_u = P_z * n_z
        let usdc_amount = (redeemable_amount as u128)
            .checked_mul(ctx.accounts.vault_usdc.amount as u128)
            .unwrap()
            .checked_div(ctx.accounts.redeemable_mint.supply as u128)
            .unwrap();

        let vault_name = ctx.accounts.vault.vault_name.as_ref();
        let seeds = vault_authority_seeds!(
            vault_name = vault_name,
            bump = ctx.accounts.vault.bumps.vault_authority
        );
        let signer = &[&seeds[..]];

        // Burn the user's redeemable tokens.
        token::burn(ctx.accounts.into_burn_context(signer), redeemable_amount)?;

        // Transfer USDC from vault account to the user's usdc account.
        token::transfer(
            ctx.accounts.into_transfer_context(signer),
            usdc_amount as u64,
        )?;

        // Send rent back to user if account is empty
        ctx.accounts.user_redeemable.reload()?;
        if ctx.accounts.user_redeemable.amount == 0 {
            token::close_account(ctx.accounts.into_close_account_context(signer))?;
        }

        Ok(())
    }
}

#[macro_export]
macro_rules! vault_authority_seeds {
    (
        vault_name = $vault_name:expr,
        bump = $bump:expr
    ) => {
        &[
            VAULT_AUTHORITY_SEED.as_bytes(),
            $vault_name.strip(),
            &[$bump],
        ]
    };
}

#[error]
pub enum ErrorCode {
    #[msg("Account not mutable")]
    AccountNotMutable,
    #[msg("Unsupported kind")]
    UnsupportedKind,
    #[msg("Product strike uninitialized")]
    ProductStrikeUninitialized,
    #[msg("Invalid product market key")]
    InvalidProductMarketKey,
    #[msg("Market not live")]
    MarketNotLive,
    #[msg("Product dirty")]
    ProductDirty,
    #[msg("Invalid option kind, must be Call or Put")]
    InvalidOptionKind,
    // Vault-specific errors
    #[msg("Epoch must start in the future")]
    VaultFuture,
    #[msg("Epoch times are non-sequential")]
    SeqTimes,
    #[msg("Epoch has not started")]
    StartEpochTime,
    #[msg("Deposits period has ended")]
    EndDepositsTime,
    #[msg("Auction has not started")]
    StartAuctionTime,
    #[msg("Auction period has ended")]
    EndAuctionTime,
    #[msg("Settlement has not started")]
    StartSettlementTime,
    #[msg("Epoch has ended")]
    EndEpochTime,
    #[msg("Epoch has not finished yet")]
    EpochNotOver,
    #[msg("Insufficient USDC balance")]
    InsufficientUsdcBalance,
    #[msg("Insufficient redeemable token balance")]
    InsufficientRedeemableBalance,
    #[msg("USDC total and redeemable total don't match")]
    UsdcNotEqRedeem,
    #[msg("Given nonce is invalid")]
    InvalidNonce,
    #[msg("Invalid USDC mint")]
    InvalidUsdcMint,
    #[msg("Invalid user USDC account owner")]
    InvalidUserUsdcAccountOwner,
    #[msg("Invalid vault admin")]
    InvalidVaultAdmin,
}

// Access control modifiers.

// Asserts the vault starts in the future.
fn validate_epoch_times(epoch_times: EpochTimes) -> ProgramResult {
    let clock = Clock::get()?;
    if epoch_times.start_epoch <= clock.unix_timestamp {
        return Err(ErrorCode::VaultFuture.into());
    }
    msg!("{}", epoch_times.start_epoch < epoch_times.end_deposits);
    if !(epoch_times.start_epoch < epoch_times.end_deposits
        && epoch_times.end_deposits < epoch_times.start_auction
        && epoch_times.start_auction < epoch_times.end_auction
        && epoch_times.end_auction < epoch_times.start_settlement
        && epoch_times.start_settlement < epoch_times.end_epoch
        && epoch_times.epoch_cadence
            >= (epoch_times
                .end_epoch
                .checked_sub(epoch_times.start_epoch)
                .unwrap() as u64))
    {
        return Err(ErrorCode::SeqTimes.into());
    }
    Ok(())
}

// Asserts the vault is still accepting deposits and withdrawals.
fn deposit_withdraw_phase(vault: &Vault) -> ProgramResult {
    let clock = Clock::get()?;
    msg!("{}", clock.unix_timestamp);
    msg!("{}", vault.epoch_times.start_epoch);
    if clock.unix_timestamp <= vault.epoch_times.start_epoch {
        return Err(ErrorCode::StartEpochTime.into());
    } else if clock.unix_timestamp > vault.epoch_times.end_deposits {
        return Err(ErrorCode::EndDepositsTime.into());
    }
    Ok(())
}

/// Trait to allow trimming ascii whitespace from a &[u8].
pub trait StripAsciiWhitespace {
    /// Trim ascii whitespace (based on `is_ascii_whitespace()`) from the
    /// start and end of a slice.
    fn strip(&self) -> &[u8];
}

impl<T: Deref<Target = [u8]>> StripAsciiWhitespace for T {
    fn strip(&self) -> &[u8] {
        let from = match self.iter().position(|x| !x.is_ascii_whitespace()) {
            Some(i) => i,
            None => return &self[0..0],
        };
        let to = self.iter().rposition(|x| !x.is_ascii_whitespace()).unwrap();
        &self[from..=to]
    }
}
