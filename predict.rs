// programs/prediction/src/lib.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint, CloseAccount};
use anchor_spl::associated_token::{self, AssociatedToken};
use std::mem::size_of;

declare_id!("PrEd1ct1on1111111111111111111111111111111111");

/// NOTE: Replace this with your actual BattleChain program id
pub const BATTLECHAIN_PROGRAM_ID: Pubkey = pubkey!("4hmtAprg26SJgUKURwVMscyMv9mTtHnbvxaAXy6VJrr8");

#[program]
pub mod prediction {
    use super::*;

    // -------------------------
    // Parlay pool initialization (singleton)
    // -------------------------
    /// Initialize the global parlay pool. `token_mint = None` => SOL pool (lamports)
    /// `token_mint = Some(mint)` => SPL pool for that mint
    pub fn initialize_parlay_pool(
        ctx: Context<InitializeParlayPool>,
        token_mint: Option<Pubkey>,
        liquidity_floor: u64,   // minimum pool liquidity to keep
        protocol_fee_bps: u16,  // e.g., 200 = 2%
        min_stake: u64,         // minimum allowed stake
        max_multiplier_x100: u64, // e.g., 500 = 5.00x
    ) -> Result<()> {
        let pool = &mut ctx.accounts.parlay_pool;
        pool.authority = ctx.accounts.authority.key();
        pool.token_mint = token_mint;
        pool.liquidity_balance = 0;
        pool.liquidity_floor = liquidity_floor;
        pool.protocol_reserve = 0;
        pool.protocol_fee_bps = protocol_fee_bps;
        pool.min_stake = min_stake;
        pool.max_multiplier_x100 = max_multiplier_x100;
        pool.bump = *ctx.bumps.get("parlay_pool").unwrap_or(&0);
        emit!(ParlayPoolCreated { pool: ctx.accounts.parlay_pool.key(), token_mint });
        Ok(())
    }

    // -------------------------
    // Place a single-game bet (per-battle)
    // -------------------------
    /// Place a single bet on a specific battle outcome.
    /// - Validates battle is open (not finished) by deserializing the Battle account.
    /// - Escrows stake (SOL or SPL) into a pool PDA associated to the battle.
    pub fn place_single_bet(
        ctx: Context<PlaceSingleBet>,
        chosen_outcome: u8,
        stake_amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.game_pool;
        let cfg = &ctx.accounts.parlay_pool; // reuse parlay_pool as global config (holds fee/min stake)
        require!(stake_amount >= cfg.min_stake, PredictionError::StakeTooSmall);

        // Validate battle is in a state that allows betting (not Finished)
        // We attempt to deserialize a minimal snapshot of your Battle account
        let battle_snapshot = deserialize_battle_snapshot(&ctx.accounts.battle)?;
        require!(battle_snapshot.state != BattleStateDiscriminant::Finished as u8, PredictionError::BattleClosed);

        // Initialize game pool if empty
        if pool.initialized == false {
            pool.pool_id = ctx.accounts.battle.key();
            pool.token_mint = ctx.accounts.parlay_pool.token_mint;
            pool.total_staked = 0;
            pool.is_settled = false;
            pool.winning_outcome = None;
            pool.bump = *ctx.bumps.get("game_pool").unwrap_or(&0);
            pool.initialized = true;
        } else {
            require!(pool.pool_id == ctx.accounts.battle.key(), PredictionError::InvalidPool);
            require!(!pool.is_settled, PredictionError::PoolAlreadySettled);
        }

        // Create Bet PDA (already created in accounts)
        let bet = &mut ctx.accounts.single_bet;
        bet.bettor = ctx.accounts.bettor.key();
        bet.pool = ctx.accounts.game_pool.key();
        bet.chosen_outcome = chosen_outcome;
        bet.stake = stake_amount;
        bet.claimed = false;
        bet.bump = *ctx.bumps.get("single_bet").unwrap_or(&0);

        // Transfer stake into escrow (game_pool_escrow)
        match pool.token_mint {
            None => {
                // SOL staking: payer transfers lamports into game_pool_escrow (here represented by game_pool Account)
                // In Anchor, to move lamports we instruct system transfer from bettor -> game_pool PDA
                invoke_signed(
                    &system_instruction::transfer(&ctx.accounts.bettor.key(), &ctx.accounts.game_pool.key(), stake_amount),
                    &[ctx.accounts.bettor.to_account_info(), ctx.accounts.game_pool.to_account_info()],
                    &[]
                )?;
                pool.total_staked = pool.total_staked.saturating_add(stake_amount);
            }
            Some(mint) => {
                // SPL staking: create escrow ATA for pool PDA if needed and transfer tokens
                if ctx.accounts.game_pool_escrow.to_account_info().data_is_empty() {
                    let cpi_accounts = associated_token::Create {
                        payer: ctx.accounts.bettor.to_account_info(),
                        associated_token: ctx.accounts.game_pool_escrow.to_account_info(),
                        authority: ctx.accounts.game_pool.to_account_info(),
                        mint: ctx.accounts.parlay_pool.token_mint.unwrap().to_account_info(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                        token_program: ctx.accounts.token_program.to_account_info(),
                        rent: ctx.accounts.rent.to_account_info(),
                        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
                    };
                    associated_token::create(CpiContext::new(ctx.accounts.associated_token_program.to_account_info(), cpi_accounts))?;
                }

                // transfer tokens
                let cpi_accounts = token::Transfer {
                    from: ctx.accounts.bettor_ata.to_account_info(),
                    to: ctx.accounts.game_pool_escrow.to_account_info(),
                    authority: ctx.accounts.bettor.to_account_info(),
                };
                let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
                token::transfer(cpi_ctx, stake_amount)?;
                pool.total_staked = pool.total_staked.saturating_add(stake_amount);
            }
        }

        emit!(SingleBetPlaced { pool: pool.pool_id, bettor: bet.bettor, stake: bet.stake, choice: bet.chosen_outcome });
        Ok(())
    }

    // -------------------------
    // Resolve single game pool (called after battle finished)
    // -------------------------
    /// Mark the winning outcome and lock pool snapshot for payouts.
    /// This should be called by an oracle / admin or the Battle program (if integrated)
    pub fn settle_single_pool(
        ctx: Context<SettleSinglePool>,
        winning_outcome: u8,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.game_pool;
        require!(pool.initialized && !pool.is_settled, PredictionError::PoolAlreadySettled);

        // Validate the passed battle is finished and matches chosen outcome (deserialization)
        let battle_snapshot = deserialize_battle_snapshot(&ctx.accounts.battle)?;
        require!(battle_snapshot.state == BattleStateDiscriminant::Finished as u8, PredictionError::BattleNotFinished);

        // store winning side and snapshot liquidity
        pool.winning_outcome = Some(winning_outcome);
        pool.is_settled = true;
        pool.snapshot_liquidity = pool.total_staked;

        emit!(SinglePoolSettled { pool: pool.pool_id, winning_outcome });
        Ok(())
    }

    // -------------------------
    // Claim from single pool (withdraw or restake into parlay)
    // -------------------------
    /// Bettor can claim a single bet. If they are a winner they may:
    /// - withdraw immediately (receive snapshot payout)
    /// - OR restake into global parlay pool by creating a restake position.
    pub fn claim_single(
        ctx: Context<ClaimSingle>,
        restake_into_parlay: bool,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.game_pool;
        let bet = &mut ctx.accounts.single_bet;
        require!(pool.is_settled, PredictionError::PoolNotSettled);
        require!(!bet.claimed, PredictionError::AlreadyClaimed);

        // determine winners/lossers
        let is_winner = match pool.winning_outcome {
            Some(w) => w == bet.chosen_outcome,
            None => false,
        };

        if !is_winner {
            // losers get nothing (their stake already in pool). Mark claimed to avoid double spend.
            bet.claimed = true;
            emit!(SingleClaimed { bettor: bet.bettor, pool: pool.pool_id, payout: 0 });
            return Ok(());
        }

        // compute payout: winners share losing stakes.
        // For simplicity: payout = bet.stake + (losers_total * bet.stake / winners_total)
        // We must iterate bets to compute totals -- here we assume an off-chain indexer or we store aggregated totals.
        // For MVP, we assume pool stores totals per outcome (not implemented in minimal code; this is conceptual).
        // We'll compute a naive payout: payout = stake * 2 (50/50). In production replace with aggregated accounting.
        let naive_payout = bet.stake.saturating_mul(2);

        // apply protocol fee (if any) from parlay_pool config
        let fee_bps = ctx.accounts.parlay_pool.protocol_fee_bps as u128;
        let fee = ((naive_payout as u128) * fee_bps / 10_000u128) as u64;
        let payout_after_fee = naive_payout.saturating_sub(fee);

        // if restake into parlay
        if restake_into_parlay {
            // move payout_after_fee into global parlay pool as liquidity
            let parlay_pool = &mut ctx.accounts.parlay_pool;
            match parlay_pool.token_mint {
                None => {
                    // SOL: transfer from game_pool account to parlay_pool PDA
                    // In reality, the game_pool escrow held the lamports — program must sign to transfer
                    // For MVP we expect the bettor to deposit into parlay pool directly client-side
                    // We'll mark the restake position locally for illustration.
                    // TODO: real lamport movement needs PDAs signing; skip here.
                    return Err(error!(PredictionError.Unimplemented).into());
                }
                Some(_) => {
                    // SPL: transfer from game_pool_escrow -> parlay_pool_vault
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.game_pool_escrow.to_account_info(),
                        to: ctx.accounts.parlay_vault_ata.to_account_info(),
                        authority: ctx.accounts.game_pool.to_account_info(),
                    };
                    let signer_seeds = &[&[b"game_pool", pool.pool_id.as_ref(), &[pool.bump]][..]];
                    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds), payout_after_fee)?;
                    parlay_pool.liquidity_balance = parlay_pool.liquidity_balance.saturating_add(payout_after_fee);
                }
            }

            // Create restake position record (ticket) pointing to parlay pool
            let restake = &mut ctx.accounts.restake_pos;
            restake.owner = ctx.accounts.bettor.key();
            restake.pool = ctx.accounts.parlay_pool.key();
            restake.share = payout_after_fee; // in snapshot model, we record share as amount; dynamic share logic would store normalized shares
            restake.created_at = Clock::get()?.unix_timestamp;
            restake.bump = *ctx.bumps.get("restake_pos").unwrap_or(&0);

            bet.claimed = true;
            emit!(SingleClaimedRestaked { bettor: bet.bettor, pool: pool.pool_id, restake_amt: payout_after_fee });
            return Ok(());
        } else {
            // Pay out to bettor
            match pool.token_mint {
                None => {
                    // SOL: transfer lamports from pool escrow -> bettor
                    // For MVP assume pool lamports available and program signs — this requires correct PDA seeds
                    invoke_signed(
                        &system_instruction::transfer(&ctx.accounts.game_pool.key(), &ctx.accounts.bettor.key(), payout_after_fee),
                        &[ctx.accounts.game_pool.to_account_info(), ctx.accounts.bettor.to_account_info()],
                        &[&[b"game_pool", pool.pool_id.as_ref(), &[pool.bump]]],
                    )?;
                }
                Some(_) => {
                    // SPL transfer from game_pool_escrow -> bettor_ata
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.game_pool_escrow.to_account_info(),
                        to: ctx.accounts.bettor_ata.to_account_info(),
                        authority: ctx.accounts.game_pool.to_account_info(),
                    };
                    let signer_seeds = &[&[b"game_pool", pool.pool_id.as_ref(), &[pool.bump]][..]];
                    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds), payout_after_fee)?;
                }
            }
            // update protocol reserve with fee (if applicable)
            ctx.accounts.parlay_pool.protocol_reserve = ctx.accounts.parlay_pool.protocol_reserve.saturating_add(fee);

            bet.claimed = true;
            emit!(SingleClaimed { bettor: bet.bettor, pool: pool.pool_id, payout: payout_after_fee });
            return Ok(());
        }
    }

    // -------------------------
    // Place a parlay bet (multi-game) into the global parlay pool
    // -------------------------
    /// The client must provide the list of game IDs they reference (we don't verify all games on-chain here for gas).
    /// For security you may require validation via indexer or off-chain oracle at placement time.
    pub fn place_parlay_bet(
        ctx: Context<PlaceParlayBet>,
        games: Vec<Pubkey>,        // battle pubkeys
        chosen_outcomes: Vec<u8>,  // matching vector
        stake: u64,
    ) -> Result<()> {
        let parlay = &mut ctx.accounts.parlay_pool;
        require!(games.len() == chosen_outcomes.len(), PredictionError::InvalidArgs);
        require!(stake >= parlay.min_stake, PredictionError::StakeTooSmall);

        // compute theoretical multiplier (simple formula: 1.5x per leg for demo)
        let legs = games.len();
        let mut multiplier_x100: u64 = 100; // 1.00x base
        for _ in 0..legs {
            multiplier_x100 = multiplier_x100.saturating_add(50); // +0.5x (50 => +0.5) per leg
        }
        // clamp multiplier to max
        if multiplier_x100 > parlay.max_multiplier_x100 {
            multiplier_x100 = parlay.max_multiplier_x100;
        }

        // escrow stake into parlay vault
        match parlay.token_mint {
            None => {
                // SOL: client must send lamports to parlay_pool PDA via system transfer
                invoke_signed(
                    &system_instruction::transfer(&ctx.accounts.bettor.key(), &ctx.accounts.parlay_pool.key(), stake),
                    &[ctx.accounts.bettor.to_account_info(), ctx.accounts.parlay_pool.to_account_info()],
                    &[],
                )?;
                parlay.liquidity_balance = parlay.liquidity_balance.saturating_add(stake);
            }
            Some(_) => {
                // create parlay vault ATA if necessary then transfer tokens
                if ctx.accounts.parlay_vault_ata.to_account_info().data_is_empty() {
                    let cpi_accounts = associated_token::Create {
                        payer: ctx.accounts.bettor.to_account_info(),
                        associated_token: ctx.accounts.parlay_vault_ata.to_account_info(),
                        authority: ctx.accounts.parlay_pool.to_account_info(),
                        mint: ctx.accounts.parlay_pool.token_mint.unwrap().to_account_info(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                        token_program: ctx.accounts.token_program.to_account_info(),
                        rent: ctx.accounts.rent.to_account_info(),
                        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
                    };
                    associated_token::create(CpiContext::new(ctx.accounts.associated_token_program.to_account_info(), cpi_accounts))?;
                }
                let cpi_accounts = token::Transfer {
                    from: ctx.accounts.bettor_ata.to_account_info(),
                    to: ctx.accounts.parlay_vault_ata.to_account_info(),
                    authority: ctx.accounts.bettor.to_account_info(),
                };
                token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts), stake)?;
                parlay.liquidity_balance = parlay.liquidity_balance.saturating_add(stake);
            }
        }

        // create ticket PDA
        let ticket = &mut ctx.accounts.parlay_ticket;
        ticket.owner = ctx.accounts.bettor.key();
        ticket.games = games;
        ticket.chosen_outcomes = chosen_outcomes;
        ticket.stake = stake;
        ticket.multiplier_x100 = multiplier_x100;
        ticket.resolved = false;
        ticket.won = None;
        ticket.claimed = false;
        ticket.created_at = Clock::get()?.unix_timestamp;
        ticket.bump = *ctx.bumps.get("parlay_ticket").unwrap_or(&0);

        // emit
        emit!(ParlayBetPlaced { ticket: ctx.accounts.parlay_ticket.key(), bettor: ticket.owner, stake: ticket.stake, multiplier_x100: ticket.multiplier_x100 });
        Ok(())
    }

    // -------------------------
    // Resolve a parlay ticket (mark as won/lost)
    // -------------------------
    /// External oracle or admin must call this after verifying games outcomes.
    pub fn resolve_parlay_ticket(
        ctx: Context<ResolveParlayTicket>,
        won: bool,
    ) -> Result<()> {
        let ticket = &mut ctx.accounts.parlay_ticket;
        require!(!ticket.resolved, PredictionError::AlreadyResolved);
        ticket.resolved = true;
        ticket.won = Some(won);

        if !won {
            // if lost, stake remains in pool; protocol takes fee portion immediately
            let fee = ((ticket.stake as u128) * (ctx.accounts.parlay_pool.protocol_fee_bps as u128) / 10_000u128) as u64;
            ctx.accounts.parlay_pool.protocol_reserve = ctx.accounts.parlay_pool.protocol_reserve.saturating_add(fee);
            // pool retains (stake - fee) so liquidity increases
            // For SPL the stake already sits in parlay_vault_ata; no transfer needed
            emit!(ParlayResolved { ticket: ctx.accounts.parlay_ticket.key(), won: false });
            return Ok(());
        } else {
            // mark snapshot payout based on current pool liquidity and multiplier
            // payout = stake * multiplier_x100/100 * pool_factor
            // simple pool_factor = liquidity_balance / initial_reference (we'll use 1.0 baseline)
            // For MVP use: payout = stake * multiplier_x100 / 100 (clamped by pool and max cap)
            let mut payout = (ticket.stake as u128) * (ticket.multiplier_x100 as u128) / 100u128;
            // clamp payout to available liquidity minus floor
            let pool_liq = ctx.accounts.parlay_pool.liquidity_balance;
            let available = pool_liq.saturating_sub(ctx.accounts.parlay_pool.liquidity_floor);
            if (payout as u128) > (available as u128) {
                payout = available as u128;
            }

            ticket.payout_snapshot = payout as u64;
            // deduct payout from liquidity (it will be paid at claim)
            ctx.accounts.parlay_pool.liquidity_balance = ctx.accounts.parlay_pool.liquidity_balance.saturating_sub(ticket.payout_snapshot);
            emit!(ParlayResolved { ticket: ctx.accounts.parlay_ticket.key(), won: true });
            return Ok(());
        }
    }

    // -------------------------
    // Claim parlay payout or restake claim
    // -------------------------
    /// If ticket.won == true:
    /// - user can `withdraw` (receive payout_snapshot)
    /// - or `restake` their payout into parlay pool as a restake position
    pub fn claim_parlay(
        ctx: Context<ClaimParlay>,
        restake: bool,
    ) -> Result<()> {
        let ticket = &mut ctx.accounts.parlay_ticket;
        require!(ticket.resolved, PredictionError::NotResolved);
        require!(ticket.won == Some(true), PredictionError::NotWinner);
        require!(!ticket.claimed, PredictionError::AlreadyClaimed);

        let payout = ticket.payout_snapshot;
        // protocol fee on payout (optional)
        let fee = ((payout as u128) * (ctx.accounts.parlay_pool.protocol_fee_bps as u128) / 10_000u128) as u64;
        let payout_after_fee = payout.saturating_sub(fee);
        ctx.accounts.parlay_pool.protocol_reserve = ctx.accounts.parlay_pool.protocol_reserve.saturating_add(fee);

        if restake {
            // simply increase pool liquidity by payout_after_fee (user converts payout into pool shares)
            ctx.accounts.parlay_pool.liquidity_balance = ctx.accounts.parlay_pool.liquidity_balance.saturating_add(payout_after_fee);
            // create restake position (store snapshot share = payout_after_fee / new_pool_liq)
            let restake = &mut ctx.accounts.restake_pos;
            restake.owner = ctx.accounts.bettor.key();
            restake.pool = ctx.accounts.parlay_pool.key();
            restake.share = payout_after_fee; // in simple model share is amount; normalized shares can be implemented
            restake.created_at = Clock::get()?.unix_timestamp;
            restake.bump = *ctx.bumps.get("restake_pos").unwrap_or(&0);
            ticket.claimed = true;
            emit!(ParlayClaimedRestaked { ticket: ctx.accounts.parlay_ticket.key(), owner: restake.owner, amt: payout_after_fee });
            return Ok(());
        } else {
            // Payout to user
            match ctx.accounts.parlay_pool.token_mint {
                None => {
                    invoke_signed(
                        &system_instruction::transfer(&ctx.accounts.parlay_pool.key(), &ctx.accounts.bettor.key(), payout_after_fee),
                        &[ctx.accounts.parlay_pool.to_account_info(), ctx.accounts.bettor.to_account_info()],
                        &[&[b"parlay_pool", &[ctx.accounts.parlay_pool.bump]]],
                    )?;
                }
                Some(_) => {
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.parlay_vault_ata.to_account_info(),
                        to: ctx.accounts.bettor_ata.to_account_info(),
                        authority: ctx.accounts.parlay_pool.to_account_info(),
                    };
                    let signer_seeds = &[&[b"parlay_pool", &[ctx.accounts.parlay_pool.bump]][..]];
                    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds), payout_after_fee)?;
                }
            }
            ticket.claimed = true;
            emit!(ParlayClaimed { ticket: ctx.accounts.parlay_ticket.key(), owner: ctx.accounts.bettor.key(), amt: payout_after_fee });
            return Ok(());
        }
    }

    // -------------------------
    // Withdraw restake (perp-like)
    // -------------------------
    /// Unstake a restake_pos: compute its share relative to current pool liquidity
    pub fn withdraw_restake(ctx: Context<WithdrawRestake>) -> Result<()> {
        let restake = &mut ctx.accounts.restake_pos;
        require!(restake.owner == ctx.accounts.owner.key(), PredictionError::Unauthorized);

        // simple model: share is raw amount; actual dynamic share accounting requires normalized shares
        let payout = restake.share; // In a proper model: share * current_liquidity / total_shares

        // apply exit fee (optional)
        let fee = ((payout as u128) * (ctx.accounts.parlay_pool.protocol_fee_bps as u128) / 10_000u128) as u64;
        let payout_after_fee = payout.saturating_sub(fee);
        ctx.accounts.parlay_pool.protocol_reserve = ctx.accounts.parlay_pool.protocol_reserve.saturating_add(fee);
        ctx.accounts.parlay_pool.liquidity_balance = ctx.accounts.parlay_pool.liquidity_balance.saturating_sub(payout_after_fee);

        // transfer out
        match ctx.accounts.parlay_pool.token_mint {
            None => {
                invoke_signed(
                    &system_instruction::transfer(&ctx.accounts.parlay_pool.key(), &ctx.accounts.owner.key(), payout_after_fee),
                    &[ctx.accounts.parlay_pool.to_account_info(), ctx.accounts.owner.to_account_info()],
                    &[&[b"parlay_pool", &[ctx.accounts.parlay_pool.bump]]],
                )?;
            }
            Some(_) => {
                let cpi_accounts = token::Transfer {
                    from: ctx.accounts.parlay_vault_ata.to_account_info(),
                    to: ctx.accounts.owner_ata.to_account_info(),
                    authority: ctx.accounts.parlay_pool.to_account_info(),
                };
                let signer_seeds = &[&[b"parlay_pool", &[ctx.accounts.parlay_pool.bump]][..]];
                token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds), payout_after_fee)?;
            }
        }

        // close restake position/account
        restake.closed = true;
        emit!(RestakeWithdrawn { owner: ctx.accounts.owner.key(), amt: payout_after_fee });
        Ok(())
    }
}

// -------------------------
// Accounts / State
// -------------------------
#[account]
pub struct ParlayPool {
    pub authority: Pubkey,
    pub token_mint: Option<Pubkey>, // None => SOL pool, Some => SPL mint
    pub liquidity_balance: u64,
    pub liquidity_floor: u64,
    pub protocol_reserve: u64,
    pub protocol_fee_bps: u16,
    pub min_stake: u64,
    pub max_multiplier_x100: u64,
    pub bump: u8,
    // reserved space
    pub _padding: [u8; 32],
}

impl ParlayPool {
    pub const INIT_SPACE: usize = 32 + 1 + 32 + 8 + 8 + 8 + 2 + 8 + 8 + 1 + 32;
}

#[account]
pub struct GamePool {
    pub pool_id: Pubkey, // battle pubkey
    pub token_mint: Option<Pubkey>,
    pub total_staked: u64,
    pub snapshot_liquidity: u64,
    pub initialized: bool,
    pub is_settled: bool,
    pub winning_outcome: Option<u8>,
    pub bump: u8,
    pub _padding: [u8; 32],
}
impl GamePool {
    pub const INIT_SPACE: usize = 32 + 1 + 32 + 8 + 8 + 1 + 1 + 1 + 32;
}

#[account]
pub struct SingleBet {
    pub bettor: Pubkey,
    pub pool: Pubkey,
    pub chosen_outcome: u8,
    pub stake: u64,
    pub claimed: bool,
    pub bump: u8,
}
impl SingleBet {
    pub const INIT_SPACE: usize = 32 + 32 + 1 + 8 + 1 + 1 + 8;
}

#[account]
pub struct ParlayTicket {
    pub owner: Pubkey,
    pub games: Vec<Pubkey>,
    pub chosen_outcomes: Vec<u8>,
    pub stake: u64,
    pub multiplier_x100: u64,
    pub resolved: bool,
    pub won: Option<bool>,
    pub payout_snapshot: u64,
    pub claimed: bool,
    pub created_at: i64,
    pub bump: u8,
}
impl ParlayTicket {
    // rough estimate
    pub const INIT_SPACE: usize = 32 + 4 + (32*8) + 4 + (8*8) + 8 + 1 + 1 + 8 + 8 + 8 + 1;
}

#[account]
pub struct RestakePosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub share: u64,
    pub created_at: i64,
    pub closed: bool,
    pub bump: u8,
}
impl RestakePosition {
    pub const INIT_SPACE: usize = 32 + 32 + 8 + 8 + 1 + 1 + 8;
}

// -------------------------
// Events
// -------------------------
#[event] pub struct ParlayPoolCreated { pub pool: Pubkey, pub token_mint: Option<Pubkey> }
#[event] pub struct SingleBetPlaced { pub pool: Pubkey, pub bettor: Pubkey, pub stake: u64, pub choice: u8 }
#[event] pub struct SinglePoolSettled { pub pool: Pubkey, pub winning_outcome: u8 }
#[event] pub struct SingleClaimed { pub bettor: Pubkey, pub pool: Pubkey, pub payout: u64 }
#[event] pub struct SingleClaimedRestaked { pub bettor: Pubkey, pub pool: Pubkey, pub restake_amt: u64 }
#[event] pub struct ParlayBetPlaced { pub ticket: Pubkey, pub bettor: Pubkey, pub stake: u64, pub multiplier_x100: u64 }
#[event] pub struct ParlayResolved { pub ticket: Pubkey, pub won: bool }
#[event] pub struct ParlayClaimed { pub ticket: Pubkey, pub owner: Pubkey, pub amt: u64 }
#[event] pub struct ParlayClaimedRestaked { pub ticket: Pubkey, pub owner: Pubkey, pub amt: u64 }
#[event] pub struct RestakeWithdrawn { pub owner: Pubkey, pub amt: u64 }

// -------------------------
// Contexts (accounts for each instruction)
// -------------------------

#[derive(Accounts)]
pub struct InitializeParlayPool<'info> {
    #[account(init, payer = authority, space = 8 + ParlayPool::INIT_SPACE, seeds = [b"parlay_pool"], bump)]
    pub parlay_pool: Account<'info, ParlayPool>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    // optional: token program & associated token program passed when SPL flows are used
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct PlaceSingleBet<'info> {
    #[account(mut)]
    pub parlay_pool: Account<'info, ParlayPool>, // used for config like min_stake & token_mint
    #[account(init_if_needed, payer = bettor, space = 8 + GamePool::INIT_SPACE, seeds = [b"game_pool", battle.key().as_ref()], bump)]
    pub game_pool: Account<'info, GamePool>,
    /// CHECK: the Battle account from the game program (deserialized for validation)
    pub battle: UncheckedAccount<'info>,
    #[account(init, payer = bettor, space = 8 + SingleBet::INIT_SPACE, seeds = [b"single_bet", game_pool.key().as_ref(), bettor.key.as_ref()], bump)]
    pub single_bet: Account<'info, SingleBet>,
    #[account(mut)]
    pub bettor: Signer<'info>,

    // SOL flow: none needed other than game_pool PDA lamports held
    // SPL flow: token accounts & escrow ATA for game_pool
    #[account(mut)]
    pub bettor_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub game_pool_escrow: Option<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SettleSinglePool<'info> {
    #[account(mut)]
    pub parlay_pool: Account<'info, ParlayPool>,
    #[account(mut)]
    pub game_pool: Account<'info, GamePool>,
    /// CHECK: Battle account
    pub battle: UncheckedAccount<'info>,
    pub signer: Signer<'info>, // oracle/admin
}

#[derive(Accounts)]
pub struct ClaimSingle<'info> {
    #[account(mut)]
    pub parlay_pool: Account<'info, ParlayPool>,
    #[account(mut)]
    pub game_pool: Account<'info, GamePool>,
    #[account(mut, has_one = pool)]
    pub single_bet: Account<'info, SingleBet>,
    #[account(mut)]
    pub bettor: Signer<'info>,
    // SPL flows
    #[account(mut)]
    pub bettor_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub game_pool_escrow: Option<Account<'info, TokenAccount>>,

    // restake / parlay vault
    #[account(mut)]
    pub parlay_vault_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub parlay_pool: Account<'info, ParlayPool>,

    // restake pos to create if restake chosen
    #[account(init_if_needed, payer = bettor, space = 8 + RestakePosition::INIT_SPACE, seeds = [b"restake", bettor.key.as_ref(), parlay_pool.key().as_ref()], bump)]
    pub restake_pos: Account<'info, RestakePosition>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct PlaceParlayBet<'info> {
    #[account(mut)]
    pub parlay_pool: Account<'info, ParlayPool>,
    #[account(init, payer = bettor, space = 8 + ParlayTicket::INIT_SPACE, seeds = [b"parlay_ticket", bettor.key.as_ref(), parlay_pool.key().as_ref()], bump)]
    pub parlay_ticket: Account<'info, ParlayTicket>,
    #[account(mut)]
    pub bettor: Signer<'info>,

    // SPL fields
    #[account(mut)]
    pub bettor_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub parlay_vault_ata: Option<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ResolveParlayTicket<'info> {
    #[account(mut)]
    pub parlay_pool: Account<'info, ParlayPool>,
    #[account(mut)]
    pub parlay_ticket: Account<'info, ParlayTicket>,
    pub signer: Signer<'info>, // oracle/admin
}

#[derive(Accounts)]
pub struct ClaimParlay<'info> {
    #[account(mut)]
    pub parlay_pool: Account<'info, ParlayPool>,
    #[account(mut, has_one = owner)]
    pub parlay_ticket: Account<'info, ParlayTicket>,
    #[account(mut)]
    pub bettor: Signer<'info>,
    // SPL fields
    #[account(mut)]
    pub parlay_vault_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub bettor_ata: Option<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = bettor, space = 8 + RestakePosition::INIT_SPACE, seeds = [b"restake", bettor.key.as_ref(), parlay_pool.key().as_ref()], bump)]
    pub restake_pos: Account<'info, RestakePosition>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct WithdrawRestake<'info> {
    #[account(mut)]
    pub parlay_pool: Account<'info, ParlayPool>,
    #[account(mut)]
    pub restake_pos: Account<'info, RestakePosition>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub owner_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub parlay_vault_ata: Option<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// -------------------------
// Helper functions & Battle deserialization (caveat)
// -------------------------

/// Minimal "Battle snapshot" layout that MUST match the battle program's Account layout for these fields.
/// If the real Battle struct changes, this deserialization will break.
/// It's highly recommended to have a shared crate for both programs that defines the exact Battle layout.
#[repr(C)]
#[derive(AnchorDeserialize, AnchorSerialize, Clone, Debug)]
pub struct BattleSnapshot {
    // Anchor account discriminator (8 bytes) omitted when reading via try_from_slice
    pub battle_id: u64,
    // We'll read the state byte as u8 (matching BattleState enum in game program)
    pub state: u8,
    // winner optional pubkey (32 bytes or something representation; here we assume Option<Pubkey> serializes as 1+32)
    pub winner_present: u8,
    pub winner: [u8; 32],
    pub start_ts: i64,
}

#[derive(Debug)]
pub enum BattleStateDiscriminant {
    Waiting = 0,
    Active = 1,
    Finished = 2,
}

fn deserialize_battle_snapshot(account: &AccountInfo) -> Result<BattleSnapshot> {
    // naive deserialization: try to skip anchor discriminator (8 bytes) and then deserialize fields
    // This is brittle and requires exact matching layout
    let data = &account.try_borrow_data()?;
    if data.len() < 8 + 8 + 1 + 1 + 32 + 8 {
        return Err(error!(PredictionError.InvalidBattleAccount));
    }
    // skip discriminator
    let slice = &data[8..];
    let mut cursor = std::io::Cursor::new(slice);
    let battle_id = u64::try_from_slice_from_reader(&mut cursor).map_err(|_| error!(PredictionError.InvalidBattleAccount))?;
    // read state u8
    let mut state_buf = [0u8;1];
    cursor.read_exact(&mut state_buf).map_err(|_| error!(PredictionError.InvalidBattleAccount))?;
    let state = state_buf[0];
    // read winner presence
    let mut present = [0u8;1];
    cursor.read_exact(&mut present).map_err(|_| error!(PredictionError.InvalidBattleAccount))?;
    let mut winner = [0u8;32];
    cursor.read_exact(&mut winner).map_err(|_| error!(PredictionError.InvalidBattleAccount))?;
    let mut ts_buf = [0u8;8];
    cursor.read_exact(&mut ts_buf).map_err(|_| error!(PredictionError.InvalidBattleAccount))?;
    let start_ts = i64::from_le_bytes(ts_buf);

    Ok(BattleSnapshot {
        battle_id,
        state,
        winner_present: present[0],
        winner,
        start_ts,
    })
}

// Small helper to read u64 from cursor using little-endian
trait ReadExt {
    fn read_u64_le(&mut self) -> std::io::Result<u64>;
}
impl ReadExt for std::io::Cursor<&[u8]> {
    fn read_u64_le(&mut self) -> std::io::Result<u64> {
        let mut buf = [0u8; 8];
        self.read_exact(&mut buf)?;
        Ok(u64::from_le_bytes(buf))
    }
}
fn u64_from_le_bytes(buf: [u8;8]) -> u64 { u64::from_le_bytes(buf) }

// tiny wrapper to emulate try_from_slice for u64
trait TryFromSliceReader {
    fn try_from_slice_from_reader(reader: &mut std::io::Cursor<&[u8]>) -> Result<u64, std::io::Error>;
}
impl TryFromSliceReader for u64 {
    fn try_from_slice_from_reader(reader: &mut std::io::Cursor<&[u8]>) -> Result<u64, std::io::Error> {
        let mut buf = [0u8;8];
        reader.read_exact(&mut buf)?;
        Ok(u64::from_le_bytes(buf))
    }
}

// -------------------------
// Errors
// -------------------------
#[error_code]
pub enum PredictionError {
    #[msg("Stake below minimum")]
    StakeTooSmall,
    #[msg("Battle is closed for betting")]
    BattleClosed,
    #[msg("Invalid or mismatched pool")]
    InvalidPool,
    #[msg("Pool already settled")]
    PoolAlreadySettled,
    #[msg("Pool not settled")]
    PoolNotSettled,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Invalid args")]
    InvalidArgs,
    #[msg("Battle not finished")]
    BattleNotFinished,
    #[msg("Invalid battle account")]
    InvalidBattleAccount,
    #[msg("Not resolved yet")]
    NotResolved,
    #[msg("Not a winner")]
    NotWinner,
    #[msg("Already resolved")]
    AlreadyResolved,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Unimplemented flow")]
    Unimplemented,
}
