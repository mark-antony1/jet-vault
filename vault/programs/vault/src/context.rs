use crate::constants::*;
//use crate::zeta_context::*;
use crate::*;

#[derive(Accounts)]
#[instruction(vault_name: String, vault_lamports: u64, bumps: VaultBumps)]
pub struct InitializeVault<'info> {
    // vault Authority accounts
    #[account(mut)]
    pub vault_admin: Signer<'info>,
    // vault Accounts
    #[account(
        init,
        seeds = [vault_name.as_bytes()],
        bump,
        payer = vault_admin
    )]
    pub vault: Box<Account<'info, Vault>>,
    // This is the PDA that holds SOL to pay for the margin account
    #[account(
        mut,
        seeds = [VAULT_AUTHORITY_SEED.as_bytes(), vault_name.as_bytes()],
        bump = bumps.vault_authority
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        mint::decimals = 8 as u8,
        mint::authority = vault_authority,
        seeds = [REDEEMABLE_MINT_SEED.as_bytes(), vault_name.as_bytes()],
        bump,
        payer = vault_admin
    )]
    pub redeemable_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        token::mint = usdc_mint,
        token::authority = vault_authority,
        seeds = [VAULT_USDC_SEED.as_bytes(), vault_name.as_bytes()],
        bump,
        payer = vault_admin
    )]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    // Jet Accounts
    #[account()]
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account()]
    pub market: UncheckedAccount<'info>,
    #[account(mut)]
    pub obligation: UncheckedAccount<'info>,
    #[account(mut)]
    pub deposit_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub collateral_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub loan_account: UncheckedAccount<'info>,
    #[account()]
    pub deposit_note_mint: UncheckedAccount<'info>,
    #[account()]
    pub loan_note_mint: UncheckedAccount<'info>,
    #[account()]
    pub reserve: UncheckedAccount<'info>,
    #[account(mut)]
    pub market_authority: UncheckedAccount<'info>,
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub jet_program: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitUserRedeemableTokenAccount<'info> {
    // User Accounts
    #[account(mut)]
    pub user_authority: Signer<'info>,
    #[account(
        init,
        token::mint = redeemable_mint,
        token::authority = user_authority,
        seeds = [USER_REDEEMABLE_SEED.as_bytes(),
            vault.vault_name.as_ref().strip(),
            user_authority.key().as_ref()],
        bump,
        payer = user_authority
    )]
    pub user_redeemable: Box<Account<'info, TokenAccount>>,
    // vault Accounts
    #[account(seeds = [vault.vault_name.as_ref().strip()],
        bump = vault.bumps.vault)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(seeds = [VAULT_AUTHORITY_SEED.as_bytes(), vault.vault_name.as_ref().strip()],
        bump = vault.bumps.vault_authority)]
    pub vault_authority: AccountInfo<'info>,
    #[account(seeds = [REDEEMABLE_MINT_SEED.as_bytes(), vault.vault_name.as_ref().strip()],
        bump = vault.bumps.redeemable_mint)]
    pub redeemable_mint: Box<Account<'info, Mint>>,
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(bumps: _DepositVaultBumps)]
pub struct DepositVault<'info> {
    // User Accounts
    pub user_authority: Signer<'info>,
    #[account(
        mut,
        constraint = user_usdc.owner == user_authority.key() @ ErrorCode::InvalidUserUsdcAccountOwner,
        constraint = user_usdc.mint == usdc_mint.key() @ ErrorCode::InvalidUsdcMint
    )]
    pub user_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [USER_REDEEMABLE_SEED.as_bytes(),
            vault.vault_name.as_ref().strip(),
            user_authority.key().as_ref()],
        bump = bumps.user_redeemable_account
    )]
    pub user_redeemable: Box<Account<'info, TokenAccount>>,
    // vault Accounts
    #[account(
        seeds = [vault.vault_name.as_ref().strip()],
        bump = vault.bumps.vault,
        constraint = vault.usdc_mint == usdc_mint.key() @ ErrorCode::InvalidUsdcMint
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        mut,
        seeds = [VAULT_AUTHORITY_SEED.as_bytes(), vault.vault_name.as_ref().strip()],
        bump = vault.bumps.vault_authority
    )]
    pub vault_authority: AccountInfo<'info>,
    #[account(mut)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [REDEEMABLE_MINT_SEED.as_bytes(), vault.vault_name.as_ref().strip()],
        bump = vault.bumps.redeemable_mint
    )]
    pub redeemable_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [VAULT_USDC_SEED.as_bytes(), vault.vault_name.as_ref().strip()],
        bump = vault.bumps.vault_usdc
    )]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    //Jet Accounts 
    #[account(mut)]
    pub market: UncheckedAccount<'info>,
    #[account(mut)]
    pub fee_note_vault: UncheckedAccount<'info>,
    #[account()]
    pub pyth_price_oracle: UncheckedAccount<'info>,
    #[account(mut)]
    pub reserve: UncheckedAccount<'info>,
    #[account(mut)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub jet_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub deposit_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub deposit_note_mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub collateral_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub loan_note_mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub loan_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub obligation: UncheckedAccount<'info>,
    // Programs and Sysvars
    pub token_program: Program<'info, Token>,
    pub jet_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct WithdrawVault<'info> {
    // User Accounts
    #[account(mut)]
    pub user_authority: Signer<'info>,
    #[account(
        mut,
        constraint = user_usdc.owner == user_authority.key() @ ErrorCode::InvalidUserUsdcAccountOwner,
        constraint = user_usdc.mint == usdc_mint.key() @ ErrorCode::InvalidUsdcMint
    )]
    pub user_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [USER_REDEEMABLE_SEED.as_bytes(),
            vault.vault_name.as_ref().strip(),
            user_authority.key().as_ref()],
        bump = bump
    )]
    pub user_redeemable: Box<Account<'info, TokenAccount>>,
    // vault Accounts
    #[account(
        seeds = [vault.vault_name.as_ref().strip()],
        bump = vault.bumps.vault,
        constraint = vault.usdc_mint == usdc_mint.key() @ ErrorCode::InvalidUsdcMint
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        seeds = [VAULT_AUTHORITY_SEED.as_bytes(), vault.vault_name.as_ref().strip()],
        bump = vault.bumps.vault_authority
    )]
    pub vault_authority: AccountInfo<'info>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [REDEEMABLE_MINT_SEED.as_bytes(), vault.vault_name.as_ref().strip()],
        bump = vault.bumps.redeemable_mint
    )]
    pub redeemable_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [VAULT_USDC_SEED.as_bytes(), vault.vault_name.as_ref().strip()],
        bump = vault.bumps.vault_usdc
    )]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    #[account()]
    pub vault_usdc_collateral: Box<Account<'info, TokenAccount>>,
    #[account()]
    pub vault_usdc_liabilities: Box<Account<'info, TokenAccount>>,
    // Programs and Sysvars
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RolloverVault<'info> {
    // vault Authority accounts
    #[account(mut)]
    pub vault_admin: Signer<'info>,
    // vault Accounts
    #[account(
        mut,
        constraint = vault.vault_admin == vault_admin.key() @ ErrorCode::InvalidVaultAdmin
    )]
    pub vault: Box<Account<'info, Vault>>,
}

#[account]
#[derive(Default)]
pub struct Vault {
    pub vault_name: [u8; 20], // Setting an arbitrary max of twenty characters in the vault name.
    pub bumps: VaultBumps,
    pub vault_admin: Pubkey,

    pub usdc_mint: Pubkey,
    pub redeemable_mint: Pubkey,
    pub vault_usdc: Pubkey,

    pub epoch_times: EpochTimes,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct EpochTimes {
    pub start_epoch: i64,      // Friday W1 10am UTC
    pub end_deposits: i64,     // Friday W1 11am UTC
    pub start_auction: i64,    // Friday W1 12:00pm UTC
    pub end_auction: i64,      // Friday W1 12:05pm UTC
    pub start_settlement: i64, // Friday W2 8am UTC
    pub end_epoch: i64,        // Friday W2 10am UTC
    pub epoch_cadence: u64,    // spacing between successive epochs in seconds
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct VaultBumps {
    pub vault: u8,
    pub vault_authority: u8,
    pub redeemable_mint: u8,
    pub vault_usdc: u8,
    pub mint_authority: u8,
    pub obligation: u8,
    pub deposit_account: u8,
    pub collateral_account: u8,
    pub loan_account: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct _DepositVaultBumps {
    pub loan_account: u8,
    pub deposit_account: u8,
    pub user_redeemable_account: u8,
    pub collateral_account: u8,
    pub obligation: u8,
}

// CPI context traits

impl<'info> DepositVault<'info> {
    pub fn into_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.user_usdc.to_account_info(),
            to: self.vault_usdc.to_account_info(),
            authority: self.user_authority.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }

    pub fn into_mint_to_context<'a, 'b, 'c>(
        &self,
        signer: &'a [&'b [&'c [u8]]],
    ) -> CpiContext<'a, 'b, 'c, 'info, MintTo<'info>> {
        let cpi_accounts = MintTo {
            mint: self.redeemable_mint.to_account_info(),
            to: self.user_redeemable.to_account_info(),
            authority: self.vault_authority.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new_with_signer(cpi_program, cpi_accounts, signer)
    }
}

impl<'info> WithdrawVault<'info> {
    pub fn into_burn_context<'a, 'b, 'c>(
        &self,
        signer: &'a [&'b [&'c [u8]]],
    ) -> CpiContext<'a, 'b, 'c, 'info, Burn<'info>> {
        let cpi_accounts = Burn {
            mint: self.redeemable_mint.to_account_info(),
            to: self.user_redeemable.to_account_info(),
            authority: self.user_authority.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new_with_signer(cpi_program, cpi_accounts, signer)
    }

    pub fn into_transfer_context<'a, 'b, 'c>(
        &self,
        signer: &'a [&'b [&'c [u8]]],
    ) -> CpiContext<'a, 'b, 'c, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.vault_usdc.to_account_info(),
            to: self.user_usdc.to_account_info(),
            authority: self.vault_authority.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new_with_signer(cpi_program, cpi_accounts, signer)
    }

    pub fn into_close_account_context<'a, 'b, 'c>(
        &self,
        signer: &'a [&'b [&'c [u8]]],
    ) -> CpiContext<'a, 'b, 'c, 'info, CloseAccount<'info>> {
        let cpi_accounts = CloseAccount {
            account: self.user_redeemable.to_account_info(),
            destination: self.user_authority.to_account_info(),
            authority: self.vault_authority.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new_with_signer(cpi_program, cpi_accounts, signer)
    }
}
