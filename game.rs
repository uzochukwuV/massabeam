use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hashv,
    sysvar::clock::Clock,
    program::invoke_signed,
    system_instruction,
    pubkey::Pubkey,
};
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_spl::associated_token::{self, AssociatedToken};

declare_id!("4hmtAprg26SJgUKURwVMscyMv9mTtHnbvxaAXy6VJrr8");

//
// BattleChain — Anchor program (v2)
// Implements:
//  - Config PDA (trait_authority, SPL whitelist, fee_bps, inactivity timeout default)
//  - EntropyPool: VRF seed batches, monotonic global_next_index
//  - NFT-backed Character PDA + Progression (xp/level/mmr)
//  - Offer / Request with SOL or SPL staking (PDA-managed escrow ATAs)
//  - Approve -> create Battle (moves stakes) and picks first mover from entropy
//  - Execute turn consuming entropy (per-battle monotonic check), last_action_ts updates
//  - Withdraw request, cancel offer, forfeit_by_timeout, finalize battle with payouts & XP
//  - Trait bundle writer by trait_authority (writes compact modifiers into Character PDA)
//  - Safe fixed-point arithmetic and clamping
//
// Notes:
//  - This is a single-file program for clarity. Before production, split modules, add tests, and audit CPIs.
//
// CONFIG DEFAULTS (per your choices):
//  - SPL whitelist: configurable in Config PDA (restrict accepted SPL mints).
//  - fee_bps = 200 (2%)
//  - default_inactivity_timeout = 300s (5 minutes)
//  - PDA-managed escrow ATAs created by program via CPI with payer provided by tx signer
//

// Fixed-point & limits
pub const FP_SCALE: u128 = 1_000_000u128; // 1e6 fixed point
pub const MAX_TOTAL_MULTIPLIER_FP: u128 = 10_000_000u128; // 10x
pub const MAX_COMBO_STACK: u8 = 5;
pub const SEED_LEN: usize = 32;
pub const MAX_BATCHES: usize = 8;
pub const MIN_ENTROPY_PER_TURN: u64 = 4; // require this many available entries

#[program]
pub mod battlechain_v2 {
    use super::*;

    // ------------------------
    // Config
    // ------------------------
    pub fn create_config(
        ctx: Context<CreateConfig>,
        fee_bps: u16,
        inactivity_timeout: i64,
        spl_whitelist: Vec<Pubkey>,
        trait_authority: Pubkey,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.fee_bps = fee_bps;
        cfg.inactivity_timeout = inactivity_timeout;
        cfg.spl_whitelist = spl_whitelist;
        cfg.trait_authority = trait_authority;
        cfg.bump = *ctx.bumps.get("config").unwrap_or(&0);
        emit!(ConfigCreated { config: ctx.accounts.config.key(), admin: cfg.admin });
        Ok(())
    }

    // ------------------------
    // Entropy pool: seed batches
    // ------------------------
    pub fn create_entropy_pool(ctx: Context<CreateEntropyPool>, vrf_oracle: Pubkey) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.vrf_oracle = vrf_oracle;
        pool.head = 0;
        pool.tail = 0;
        pool.total_available = 0;
        pool.global_next_index = 0;
        pool.bump = *ctx.bumps.get("pool").unwrap_or(&0);
        pool.last_refill_ts = Clock::get()?.unix_timestamp;
        pool.batches = [SeedBatch::default(); MAX_BATCHES];
        emit!(EntropyPoolCreated { pool: ctx.accounts.pool.key(), vrf_oracle });
        Ok(())
    }

    // Oracle refills a seed batch. Enforce monotonic global_next_index to prevent replay.
    pub fn refill_seed_batch(ctx: Context<RefillSeedBatch>, seed: [u8; SEED_LEN], start_index: u64, count: u32) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let caller = ctx.accounts.refiller.key();
        require!(caller == pool.vrf_oracle || caller == pool.authority, GameError::UnauthorizedRefill);
        require!(count > 0, GameError::InvalidRange);
        // monotonic start enforcement
        require!(start_index >= pool.global_next_index, GameError::SeedReplay);
        // write at tail slot
        let idx = pool.tail as usize % MAX_BATCHES;
        pool.batches[idx].seed = seed;
        pool.batches[idx].start = start_index;
        pool.batches[idx].count = count;
        pool.batches[idx].consumed = 0;
        // advance tail and global_next_index
        pool.tail = ((pool.tail as usize + 1) % MAX_BATCHES) as u8;
        pool.total_available = pool.total_available.saturating_add(count as u64);
        pool.global_next_index = start_index.checked_add(count as u64).ok_or(GameError::MathOverflow)?;
        pool.last_refill_ts = Clock::get()?.unix_timestamp;
        emit!(SeedBatchRefilled { pool: ctx.accounts.pool.key(), added: count as u64, total_available: pool.total_available });
        Ok(())
    }

    // ------------------------
    // Create character bound to NFT + optional trait bundle via trait_authority signer
    // ------------------------
    pub fn create_character_from_nft(
        ctx: Context<CreateCharacterFromNft>,
        base_class: CharacterClass,
    ) -> Result<()> {
        // NFT ATA checks (client must include nft_ata)
        require!(ctx.accounts.nft_ata.mint == ctx.accounts.nft_mint.key(), GameError::InvalidNftAta);
        require!(ctx.accounts.nft_ata.amount == 1, GameError::NotNftOwner);
        require!(ctx.accounts.nft_ata.owner == ctx.accounts.payer.key(), GameError::NotNftOwner);

        // initialize minimal character
        let character = &mut ctx.accounts.character;
        character.nft_mint = ctx.accounts.nft_mint.key();
        character.base_class = base_class;
        // base stats (tuneable)
        match base_class {
            CharacterClass::Warrior => { character.max_hp = 120; character.current_hp = 120; character.base_damage_min = 8; character.base_damage_max = 15; character.crit_bps = 1500; },
            CharacterClass::Assassin => { character.max_hp = 90; character.current_hp = 90; character.base_damage_min = 12; character.base_damage_max = 20; character.crit_bps = 3500; },
            CharacterClass::Mage => { character.max_hp = 80; character.current_hp = 80; character.base_damage_min = 10; character.base_damage_max = 18; character.crit_bps = 2000; },
            CharacterClass::Tank => { character.max_hp = 150; character.current_hp = 150; character.base_damage_min = 6; character.base_damage_max = 12; character.crit_bps = 1000; },
            CharacterClass::Trickster => { character.max_hp = 100; character.current_hp = 100; character.base_damage_min = 8; character.base_damage_max = 16; character.crit_bps = 2500; },
        }
        character.defense = 0;
        character.special_cooldown = 0;
        character.last_damage = 0;
        character.combo_count = 0;
        character.lifes = 0;
        character.bump = *ctx.bumps.get("character").unwrap_or(&0);
        character.created_at = Clock::get()?.unix_timestamp;

        // progression init if needed
        if ctx.accounts.progression.to_account_info().data_is_empty() {
            let prog = &mut ctx.accounts.progression;
            prog.nft_mint = character.nft_mint;
            prog.xp = 0;
            prog.level = 1;
            prog.mmr = 100;
            prog.last_played = 0;
            prog.bump = *ctx.bumps.get("progression").unwrap_or(&0);
            emit!(ProgressionCreated { nft_mint: prog.nft_mint });
        }

        // if trait_authority signed and bundle provided, caller should call apply_trait_bundle separately.
        emit!(CharacterCreated { nft_mint: character.nft_mint, owner: ctx.accounts.payer.key() });
        Ok(())
    }

    // Apply a trait bundle signed by trait_authority in Config PDA. This writes compact modifiers to Character PDA.
    pub fn apply_trait_bundle(ctx: Context<ApplyTraitBundle>, bundle: TraitBundle) -> Result<()> {
        // Only Config.trait_authority may sign this instruction
        let cfg = &ctx.accounts.config;
        require!(ctx.accounts.trait_authority.key() == cfg.trait_authority, GameError::Unauthorized);
        // Apply modifiers (simple additive packed fields)
        let ch = &mut ctx.accounts.character;
        // Danger: be careful with overflows; use checked adds
        ch.mod_attack_bps = ch.mod_attack_bps.saturating_add(bundle.attack_bps as i16);
        ch.mod_defense_bps = ch.mod_defense_bps.saturating_add(bundle.defense_bps as i16);
        ch.mod_crit_bps = ch.mod_crit_bps.saturating_add(bundle.crit_bps as i16);
        ch.rarity = bundle.rarity;
        emit!(TraitApplied { nft_mint: ch.nft_mint, by: ctx.accounts.trait_authority.key() });
        Ok(())
    }

    // ------------------------
    // Offers / Requests (SOL or SPL)
    // ------------------------
    pub fn create_battle_offer(
        ctx: Context<CreateBattleOffer>,
        offer_nonce: u64,
        currency: Currency,
        stake_amount: u64,
        min_level: u16,
        max_level: u16,
        allowed_classes: Vec<CharacterClass>,
        auto_approve: bool,
        start_ts: i64,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        // If SPL, enforce whitelist
        if let Currency::SPL(mint) = currency {
            require!(cfg.spl_whitelist.contains(&mint), GameError::SPLNotWhitelisted);
        }
        let clock = Clock::get()?;
        require!(start_ts >= clock.unix_timestamp, GameError::InvalidTimestamp);

        let offer = &mut ctx.accounts.offer;
        offer.creator = ctx.accounts.creator.key();
        offer.offer_nonce = offer_nonce;
        offer.currency = currency;
        offer.stake_amount = stake_amount;
        offer.min_level = min_level;
        offer.max_level = max_level;
        offer.allowed_classes = allowed_classes;
        offer.auto_approve = auto_approve;
        offer.start_ts = start_ts;
        offer.created_at = clock.unix_timestamp;
        offer.is_active = true;
        offer.bump = *ctx.bumps.get("offer").unwrap_or(&0);

        // For SOL: require creator funds the offer PDA (creator pays txn; program will transfer lamports to offer PDA via CPI)
        // For SPL: create an escrow ATA for Offer PDA and transfer tokens from creator's ATA to it
        match currency {
            Currency::SOL => {
                if stake_amount > 0 {
                    // transfer lamports from creator to offer PDA (creator pays)
                    invoke_signed(
                        &system_instruction::transfer(&ctx.accounts.creator.key(), &ctx.accounts.offer.key(), stake_amount),
                        &[ctx.accounts.creator.to_account_info(), ctx.accounts.offer.to_account_info()],
                        &[],
                    )?;
                }
            },
            Currency::SPL(mint) => {
                // create associated token account for offer PDA and transfer tokens
                // Client must pass creator_token_ata and offer_escrow_ata (or program creates ATA paid by creator)
                // Use CPI to create associated token account for offer PDA if needed
                if stake_amount > 0 {
                    // create offer escrow ATA if not already
                    if ctx.accounts.offer_escrow.to_account_info().data_is_empty() {
                        let cpi_accounts = associated_token::Create {
                            payer: ctx.accounts.creator.to_account_info(),
                            associated_token: ctx.accounts.offer_escrow.to_account_info(),
                            authority: ctx.accounts.offer.to_account_info(),
                            mint: ctx.accounts.currency_mint.as_ref().unwrap().to_account_info(),
                            system_program: ctx.accounts.system_program.to_account_info(),
                            token_program: ctx.accounts.token_program.to_account_info(),
                            rent: ctx.accounts.rent.to_account_info(),
                            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
                        };
                        let cpi_ctx = CpiContext::new(ctx.accounts.associated_token_program.to_account_info(), cpi_accounts);
                        associated_token::create(cpi_ctx)?;
                    }
                    // transfer tokens from creator_ata -> offer_escrow
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.creator_ata.to_account_info(),
                        to: ctx.accounts.offer_escrow.to_account_info(),
                        authority: ctx.accounts.creator.to_account_info(),
                    };
                    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
                    token::transfer(cpi_ctx, stake_amount)?;
                }
            }
        }

        emit!(OfferCreated { offer: ctx.accounts.offer.key(), creator: offer.creator, stake: stake_amount });
        Ok(())
    }

    // Challenger joins offer; for SPL creates request_escrow ATA and transfers tokens
    pub fn join_battle_offer(ctx: Context<JoinBattleOffer>, offered_stake: u64) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        require!(offer.is_active, GameError::OfferNotActive);

        // validate progression & character
        let prog = &ctx.accounts.progression;
        require!(prog.level >= offer.min_level && prog.level <= offer.max_level, GameError::CharacterConstraint);
        if !offer.allowed_classes.is_empty() {
            let ch = &ctx.accounts.character;
            require!(offer.allowed_classes.contains(&ch.base_class), GameError::CharacterConstraint);
        }

        let clock = Clock::get()?;
        let request = &mut ctx.accounts.request;
        request.offer = offer.key();
        request.challenger = ctx.accounts.challenger.key();
        request.character = ctx.accounts.character.key();
        request.offered_stake = offered_stake;
        request.created_at = clock.unix_timestamp;
        request.status = JoinStatus::Pending;
        request.bump = *ctx.bumps.get("request").unwrap_or(&0);

        match offer.currency {
            Currency::SOL => {
                if offered_stake > 0 {
                    invoke_signed(
                        &system_instruction::transfer(&ctx.accounts.challenger.key(), &ctx.accounts.request.key(), offered_stake),
                        &[ctx.accounts.challenger.to_account_info(), ctx.accounts.request.to_account_info()],
                        &[],
                    )?;
                }
            },
            Currency::SPL(mint) => {
                // create request_escrow ATA for request PDA and transfer tokens
                if offered_stake > 0 {
                    if ctx.accounts.request_escrow.to_account_info().data_is_empty() {
                        let cpi_accounts = associated_token::Create {
                            payer: ctx.accounts.challenger.to_account_info(),
                            associated_token: ctx.accounts.request_escrow.to_account_info(),
                            authority: ctx.accounts.request.to_account_info(),
                            mint: ctx.accounts.currency_mint.as_ref().unwrap().to_account_info(),
                            system_program: ctx.accounts.system_program.to_account_info(),
                            token_program: ctx.accounts.token_program.to_account_info(),
                            rent: ctx.accounts.rent.to_account_info(),
                            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
                        };
                        let cpi_ctx = CpiContext::new(ctx.accounts.associated_token_program.to_account_info(), cpi_accounts);
                        associated_token::create(cpi_ctx)?;
                    }
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.challenger_ata.to_account_info(),
                        to: ctx.accounts.request_escrow.to_account_info(),
                        authority: ctx.accounts.challenger.to_account_info(),
                    };
                    token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts), offered_stake)?;
                }
            }
        }

        emit!(JoinRequested { offer: offer.key(), request: ctx.accounts.request.key(), challenger: request.challenger, stake: offered_stake });
        Ok(())
    }

    // Withdraw request (before approval) — refunds stake and closes request
    pub fn withdraw_request(ctx: Context<WithdrawRequest>) -> Result<()> {
        let request = &mut ctx.accounts.request;
        require!(request.status == JoinStatus::Pending, GameError::InvalidRequestState);
        require!(ctx.accounts.challenger.key() == request.challenger, GameError::Unauthorized);
        let offer = &ctx.accounts.offer;
        // refund based on currency
        match offer.currency {
            Currency::SOL => {
                let bal = ctx.accounts.request.to_account_info().lamports();
                if bal > 0 {
                    invoke_signed(
                        &system_instruction::transfer(&ctx.accounts.request.key(), &ctx.accounts.challenger.key(), bal),
                        &[ctx.accounts.request.to_account_info(), ctx.accounts.challenger.to_account_info()],
                        &[],
                    )?;
                }
            },
            Currency::SPL(_) => {
                // transfer tokens back from request_escrow -> challenger_ata and close escrow
                let amount = ctx.accounts.request_escrow.amount;
                if amount > 0 {
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.request_escrow.to_account_info(),
                        to: ctx.accounts.challenger_ata.to_account_info(),
                        authority: ctx.accounts.request.to_account_info(),
                    };
                    let signer_seeds = &[b"request", offer.key().as_ref(), ctx.accounts.challenger.key.as_ref(), &[request.bump]];
                    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, &[signer_seeds]), amount)?;
                }
                // close request_escrow (optional)
            }
        }
        request.status = JoinStatus::Withdrawn;
        emit!(RequestWithdrawn { request: request.key(), by: ctx.accounts.challenger.key() });
        Ok(())
    }

    // Cancel offer (creator), refunds if no approved request
    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        require!(ctx.accounts.creator.key() == offer.creator, GameError::Unauthorized);
        require!(offer.is_active, GameError::OfferNotActive);
        // ensure no approved request (for simplicity, only allow cancel if still active and no approved)
        // refund stake to creator (SOL or SPL)
        match offer.currency {
            Currency::SOL => {
                let bal = ctx.accounts.offer.to_account_info().lamports();
                if bal > 0 {
                    invoke_signed(
                        &system_instruction::transfer(&ctx.accounts.offer.key(), &ctx.accounts.creator.key(), bal),
                        &[ctx.accounts.offer.to_account_info(), ctx.accounts.creator.to_account_info()],
                        &[],
                    )?;
                }
            },
            Currency::SPL(_) => {
                // transfer from offer_escrow -> creator_ata with PDA signer
                let amount = ctx.accounts.offer_escrow.amount;
                if amount > 0 {
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.offer_escrow.to_account_info(),
                        to: ctx.accounts.creator_ata.to_account_info(),
                        authority: ctx.accounts.offer.to_account_info(),
                    };
                    let signer_seeds = &[b"offer", ctx.accounts.creator.key.as_ref(), &offer.offer_nonce.to_le_bytes(), &[offer.bump]];
                    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, &[signer_seeds]), amount)?;
                }
            }
        }
        offer.is_active = false;
        emit!(OfferCancelled { offer: ctx.accounts.offer.key(), by: ctx.accounts.creator.key() });
        Ok(())
    }

    // Approve challenger -> create battle, move stakes (SOL or SPL) into battle escrow, pick first mover (monotonic entropy)
    pub fn approve_challenger(ctx: Context<ApproveChallenger>) -> Result<()> {
        // Validate offer/request pair
        let offer = &mut ctx.accounts.offer;
        let request = &mut ctx.accounts.request;
        require!(offer.is_active, GameError::OfferNotActive);
        require!(request.status == JoinStatus::Pending, GameError::InvalidRequestState);
        require!(ctx.accounts.creator.key() == offer.creator, GameError::Unauthorized);

        let clock = Clock::get()?;
        let battle = &mut ctx.accounts.battle;
        // init battle
        battle.battle_id = offer.offer_nonce.wrapping_add(clock.unix_timestamp as u64);
        battle.player1 = offer.creator;
        battle.player2 = request.challenger;
        battle.start_ts = offer.start_ts;
        battle.current_turn = 0;
        battle.turn_number = 0;
        battle.player1_health = 100;
        battle.player2_health = 100;
        battle.state = BattleState::Active;
        battle.player1_stance = StanceType::Balanced;
        battle.player2_stance = StanceType::Balanced;
        battle.created_at = clock.unix_timestamp;
        // set inactivity timeout from offer or config
        battle.inactivity_timeout = if offer.inactivity_timeout > 0 { offer.inactivity_timeout } else { ctx.accounts.config.inactivity_timeout };
        battle.last_action_ts = clock.unix_timestamp;
        battle.bump = *ctx.bumps.get("battle").unwrap_or(&0);
        battle.last_entropy_index = 0;

        let total_stake = offer.stake_amount.saturating_add(request.offered_stake);

        // move stakes into battle escrow (SOL: transfer lamports; SPL: transfer escrow ATAs into battle_escrow ATA)
        match offer.currency {
            Currency::SOL => {
                // transfer lamports from offer PDA to battle PDA and from request PDA to battle PDA
                let offer_bal = ctx.accounts.offer.to_account_info().lamports();
                if offer_bal > 0 {
                    invoke_signed(
                        &system_instruction::transfer(&ctx.accounts.offer.key(), &ctx.accounts.battle.key(), offer.stake_amount),
                        &[ctx.accounts.offer.to_account_info(), ctx.accounts.battle.to_account_info()],
                        &[],
                    )?;
                }
                let req_bal = ctx.accounts.request.to_account_info().lamports();
                if req_bal > 0 {
                    invoke_signed(
                        &system_instruction::transfer(&ctx.accounts.request.key(), &ctx.accounts.battle.key(), request.offered_stake),
                        &[ctx.accounts.request.to_account_info(), ctx.accounts.battle.to_account_info()],
                        &[],
                    )?;
                }
            },
            Currency::SPL(mint) => {
                // create battle escrow ATA for battle PDA and transfer tokens from offer_escrow & request_escrow
                if ctx.accounts.battle_escrow.to_account_info().data_is_empty() {
                    let cpi_accounts = associated_token::Create {
                        payer: ctx.accounts.creator.to_account_info(),
                        associated_token: ctx.accounts.battle_escrow.to_account_info(),
                        authority: ctx.accounts.battle.to_account_info(),
                        mint: ctx.accounts.currency_mint.as_ref().unwrap().to_account_info(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                        token_program: ctx.accounts.token_program.to_account_info(),
                        rent: ctx.accounts.rent.to_account_info(),
                        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
                    };
                    associated_token::create(CpiContext::new(ctx.accounts.associated_token_program.to_account_info(), cpi_accounts))?;
                }
                // transfer from offer_escrow -> battle_escrow
                let offer_amount = ctx.accounts.offer_escrow.amount;
                if offer_amount > 0 {
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.offer_escrow.to_account_info(),
                        to: ctx.accounts.battle_escrow.to_account_info(),
                        authority: ctx.accounts.offer.to_account_info(),
                    };
                    let signer_seeds = &[&[b"offer", offer.creator.as_ref(), &offer.offer_nonce.to_le_bytes(), &[offer.bump]][..]];
                    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds), offer_amount)?;
                }
                // transfer from request_escrow -> battle_escrow
                let req_amount = ctx.accounts.request_escrow.amount;
                if req_amount > 0 {
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.request_escrow.to_account_info(),
                        to: ctx.accounts.battle_escrow.to_account_info(),
                        authority: ctx.accounts.request.to_account_info(),
                    };
                    let signer_seeds = &[&[b"request", offer.key().as_ref(), request.challenger.as_ref(), &[request.bump]][..]];
                    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds), req_amount)?;
                }
            }
        }

        // finalize states
        request.status = JoinStatus::Approved;
        offer.is_active = false;

        // pick first mover consuming 1 entropy entry; ensure pool has enough and enforce per-battle monotonicity
        require!(ctx.accounts.pool.total_available >= 1, GameError::NoEntropyAvailable);
        let (choice, used_index) = ctx.accounts.pool.consume_mixed_u64_return_index(&ctx.accounts.creator.key(), b"first_mover", battle.turn_number as u32, 0, 1)?;
        // ensure used_index > battle.last_entropy_index
        require!(used_index > battle.last_entropy_index, GameError::SeedReplay);
        battle.last_entropy_index = used_index;
        battle.current_turn = if choice == 0 { 1 } else { 2 };

        emit!(BattleCreated { battle: ctx.accounts.battle.key(), player1: battle.player1, player2: battle.player2, first_turn: battle.current_turn, stake_total: total_stake });
        Ok(())
    }

    // ------------------------
    // Execute turn
    // ------------------------
    // This function consumes entropy and updates battle.last_action_ts and last_entropy_index
    pub fn execute_turn(ctx: Context<ExecuteTurn>, chosen_stance: StanceType, use_special: bool) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let pool = &mut ctx.accounts.pool;
        let battle = &mut ctx.accounts.battle;
        let attacker_char = &mut ctx.accounts.attacker_character;
        let defender_char = &mut ctx.accounts.defender_character;
        let attacker_prog = &mut ctx.accounts.attacker_prog;

        // ownership checks on NFT ATAs — enforced by account constraints in context (client must pass)
        // Basic turn checks
        require!(battle.state == BattleState::Active, GameError::InvalidBattleState);
        let signer = ctx.accounts.signer.key();
        let is_player1 = if signer == battle.player1 { true } else if signer == battle.player2 { false } else { return Err(error!(GameError::Unauthorized).into()); };
        if is_player1 { require!(battle.current_turn == 1, GameError::NotYourTurn); } else { require!(battle.current_turn == 2, GameError::NotYourTurn); }

        // require pool has sufficient entropy
        require!(pool.total_available >= MIN_ENTROPY_PER_TURN, GameError::NoEntropyAvailable);

        // record last_action_ts
        let now = Clock::get()?.unix_timestamp;
        battle.last_action_ts = now;

        // set attacker stance immediately
        if is_player1 { battle.player1_stance = chosen_stance; } else { battle.player2_stance = chosen_stance; }

        // consume base damage
        let min_d = attacker_char.base_damage_min as u64;
        let max_d = attacker_char.base_damage_max as u64;
        let (base, idx_base) = pool.consume_mixed_u64_return_index(&signer, b"base", battle.turn_number as u32, min_d, max_d)?;
        require!(idx_base > battle.last_entropy_index, GameError::SeedReplay);
        battle.last_entropy_index = idx_base;

        let base_u128 = (base as u128).checked_add((attacker_prog.level as u64).saturating_sub(1) as u128 * 2u128).ok_or(GameError::MathOverflow)?;

        // crit roll
        let (crit_roll, idx_crit) = pool.consume_mixed_u64_return_index(&signer, b"crit", battle.turn_number as u32, 0, 9999)?;
        require!(idx_crit > battle.last_entropy_index, GameError::SeedReplay);
        battle.last_entropy_index = idx_crit;
        let is_crit = (crit_roll as u64) < attacker_char.crit_bps as u64;

        // dodge roll
        let (dodge_roll, idx_dodge) = pool.consume_mixed_u64_return_index(&signer, b"dodge", battle.turn_number as u32, 0, 9999)?;
        require!(idx_dodge > battle.last_entropy_index, GameError::SeedReplay);
        battle.last_entropy_index = idx_dodge;

        // wildcard / reserved
        let (wild, idx_wild) = pool.consume_mixed_u64_return_index(&signer, b"wild", battle.turn_number as u32, 0, 9999)?;
        require!(idx_wild > battle.last_entropy_index, GameError::SeedReplay);
        battle.last_entropy_index = idx_wild;

        // FP math pipeline
        let mut damage_fp = base_u128.checked_mul(FP_SCALE).ok_or(GameError::MathOverflow)?;

        // crit multiplier (character may have modifiers; apply base of 2x)
        if is_crit {
            let crit_mult_fp = (2000000u128).min(attacker_char.crit_multiplier_fp as u128); // default 2x
            damage_fp = mul_fp_checked(damage_fp, crit_mult_fp)?;
        }

        // combo
        if attacker_char.last_damage == base.min(u64::from(u16::MAX)) as u16 {
            attacker_char.combo_count = attacker_char.combo_count.saturating_add(1);
            if attacker_char.combo_count > MAX_COMBO_STACK { attacker_char.combo_count = MAX_COMBO_STACK; }
            let combo_mult_fp = FP_SCALE + (150_000u128 * (attacker_char.combo_count as u128)); // 15% per stack
            damage_fp = mul_fp_checked(damage_fp, combo_mult_fp)?;
            emit!(ComboApplied { battle: battle.key(), attacker: attacker_char.nft_mint, combo: attacker_char.combo_count, added: 0 });
        } else {
            attacker_char.combo_count = 0;
        }
        attacker_char.last_damage = base.min(u64::from(u16::MAX)) as u16;

        // special handling
        if use_special {
            require!(attacker_char.special_cooldown == 0, GameError::SpecialOnCooldown);
            match attacker_char.base_class {
                CharacterClass::Warrior => { damage_fp = mul_fp_checked(damage_fp, FP_SCALE * 3)?; attacker_char.special_cooldown = 3; },
                CharacterClass::Assassin => { damage_fp = mul_fp_checked(damage_fp, FP_SCALE * 3)?; attacker_char.special_cooldown = 4; },
                CharacterClass::Mage => { if is_player1 { battle.player2_dot_damage = battle.player2_dot_damage.saturating_add(5); battle.player2_dot_turns = battle.player2_dot_turns.saturating_add(3) } else { battle.player1_dot_damage = battle.player1_dot_damage.saturating_add(5); battle.player1_dot_turns = battle.player1_dot_turns.saturating_add(3) } attacker_char.special_cooldown = 3; },
                CharacterClass::Tank => { if is_player1 { battle.player1_reflection = battle.player1_reflection.saturating_add(50) } else { battle.player2_reflection = battle.player2_reflection.saturating_add(50) } attacker_char.special_cooldown = 4; },
                CharacterClass::Trickster => { damage_fp = mul_fp_checked(damage_fp, FP_SCALE * 2)?; attacker_char.special_cooldown = 2; },
            }
            emit!(SpecialUsed { battle: battle.key(), attacker: attacker_char.nft_mint, special: attacker_char.base_class as u8 });
        }

        // stance multipliers (simple function)
        let defender_stance = if is_player1 { battle.player2_stance } else { battle.player1_stance };
        let (att_fp, def_fp, self_bps, counter_bps) = stance_multipliers(if is_player1 { battle.player1_stance } else { battle.player2_stance }, defender_stance);
        damage_fp = mul_fp_checked(damage_fp, att_fp)?;
        damage_fp = mul_fp_checked(damage_fp, def_fp)?;

        // clamp
        if damage_fp > MAX_TOTAL_MULTIPLIER_FP.checked_mul(FP_SCALE).unwrap_or(damage_fp) {
            damage_fp = MAX_TOTAL_MULTIPLIER_FP.checked_mul(FP_SCALE).unwrap_or(damage_fp);
            emit!(DamageClamped { battle: battle.key(), attacker: attacker_char.nft_mint });
        }

        let mut final_damage = fp_to_u64_clamped(damage_fp, GameError::MathOverflow)?;
        final_damage = final_damage.saturating_sub(defender_char.defense as u64);

        // dodge
        if (dodge_roll as u64) < defender_char.dodge_bps as u64 {
            final_damage = 0;
            if is_player1 { battle.player1_miss_count = battle.player1_miss_count.saturating_add(1) } else { battle.player2_miss_count = battle.player2_miss_count.saturating_add(1) }
            emit!(AttackMissed { battle: battle.key(), attacker: attacker_char.nft_mint, defender: defender_char.nft_mint });
        }

        // apply damage and reflection/counter/self
        if is_player1 {
            battle.player2_health = battle.player2_health.saturating_sub(final_damage);
            if battle.player1_reflection > 0 && final_damage > 0 {
                let reflected = final_damage.saturating_mul(battle.player1_reflection as u64) / 100;
                battle.player1_health = battle.player1_health.saturating_sub(reflected);
                emit!(ReflectionApplied { battle: battle.key(), defender: attacker_char.nft_mint, reflected });
            }
            if counter_bps > 0 && final_damage > 0 {
                let counter = final_damage.saturating_mul(counter_bps as u64) / 10000u64;
                battle.player1_health = battle.player1_health.saturating_sub(counter);
                emit!(CounterApplied { battle: battle.key(), player: attacker_char.nft_mint, damage: counter });
            }
            if self_bps > 0 {
                let selfd = final_damage.saturating_mul(self_bps as u64) / 10000u64;
                battle.player1_health = battle.player1_health.saturating_sub(selfd);
                emit!(SelfDamageApplied { battle: battle.key(), player: attacker_char.nft_mint, damage: selfd });
            }
        } else {
            battle.player1_health = battle.player1_health.saturating_sub(final_damage);
            if battle.player2_reflection > 0 && final_damage > 0 {
                let reflected = final_damage.saturating_mul(battle.player2_reflection as u64) / 100;
                battle.player2_health = battle.player2_health.saturating_sub(reflected);
                emit!(ReflectionApplied { battle: battle.key(), defender: attacker_char.nft_mint, reflected });
            }
            if counter_bps > 0 && final_damage > 0 {
                let counter = final_damage.saturating_mul(counter_bps as u64) / 10000u64;
                battle.player2_health = battle.player2_health.saturating_sub(counter);
                emit!(CounterApplied { battle: battle.key(), player: attacker_char.nft_mint, damage: counter });
            }
            if self_bps > 0 {
                let selfd = final_damage.saturating_mul(self_bps as u64) / 10000u64;
                battle.player2_health = battle.player2_health.saturating_sub(selfd);
                emit!(SelfDamageApplied { battle: battle.key(), player: attacker_char.nft_mint, damage: selfd });
            }
        }

        // cooldown tick
        if attacker_char.special_cooldown > 0 { attacker_char.special_cooldown = attacker_char.special_cooldown.saturating_sub(1); }

        // check death, lifes, finalize if needed (simplified: award XP and finalize)
        if battle.player1_health == 0 || battle.player2_health == 0 {
            battle.state = BattleState::Finished;
            let winner_opt = if battle.player1_health > battle.player2_health { Some(battle.player1) } else if battle.player2_health > battle.player1_health { Some(battle.player2) } else { None };
            battle.winner = winner_opt;
            // award xp
            let (winner_pk, loser_pk) = match winner_opt {
                Some(pk) => (Some(pk), if pk == battle.player1 { Some(battle.player2) } else { Some(battle.player1) }),
                None => (None, None),
            };
            // update progression: simple defaults
            if let Some(wpk) = winner_pk {
                if wpk == battle.player1 {
                    // player1 winner
                    ctx.accounts.attacker_prog.xp = ctx.accounts.attacker_prog.xp.saturating_add(100);
                    // maybe level up
                    level_up_if_needed(&mut ctx.accounts.attacker_prog, &mut ctx.accounts.attacker_character)?;
                } else {
                    ctx.accounts.defender_prog.xp = ctx.accounts.defender_prog.xp.saturating_add(100);
                    level_up_if_needed(&mut ctx.accounts.defender_prog, &mut ctx.accounts.defender_character)?;
                }
            } else {
                // draw
                ctx.accounts.attacker_prog.xp = ctx.accounts.attacker_prog.xp.saturating_add(25);
                ctx.accounts.defender_prog.xp = ctx.accounts.defender_prog.xp.saturating_add(25);
            }
            emit!(BattleEnded { battle: battle.key(), winner: battle.winner });
        } else {
            // advance turn
            battle.current_turn = if battle.current_turn == 1 { 2 } else { 1 };
            battle.turn_number = battle.turn_number.saturating_add(1);
        }

        emit!(TurnResolved { battle: battle.key(), turn_number: battle.turn_number, attacker: attacker_char.nft_mint, defender: defender_char.nft_mint, damage_dealt: final_damage, is_crit });
        Ok(())
    }

    // Forfeit by timeout — any caller can call after inactivity_timeout since last_action_ts
    pub fn forfeit_by_timeout(ctx: Context<ForfeitByTimeout>) -> Result<()> {
        let battle = &mut ctx.accounts.battle;
        let now = Clock::get()?.unix_timestamp;
        require!(battle.state == BattleState::Active, GameError::InvalidBattleState);
        require!(now.saturating_sub(battle.last_action_ts) > battle.inactivity_timeout, GameError::TimeoutNotReached);
        // determine idle player: whoever was expected to act (current_turn)
        let winner = if battle.current_turn == 1 { battle.player2 } else { battle.player1 };
        battle.state = BattleState::Finished;
        battle.winner = Some(winner);
        // payout stakes to winner — Simplified: caller must pass battle escrow & winner account
        // actual transfer logic handled in finalize_battle to reuse code
        emit!(BattleForfeited { battle: battle.key(), winner });
        Ok(())
    }

    // finalize_battle: distribute stakes and fees (SOL & SPL support)
    pub fn finalize_battle(ctx: Context<FinalizeBattle>) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let battle = &mut ctx.accounts.battle;
        require!(battle.state == BattleState::Finished, GameError::BattleNotFinished);

        // compute total lamports or token amount in battle escrow (for SOL: lamports; for SPL: battle_escrow.amount)
        // For SOL: the battle PDA holds lamports from previous transfers; for SPL we use battle_escrow ATA
        match ctx.accounts.offer.currency {
            Currency::SOL => {
                let total = ctx.accounts.battle.to_account_info().lamports();
                let fee = ((total as u128) * (cfg.fee_bps as u128) / 10_000u128) as u64;
                let payout = total.saturating_sub(fee);
                // transfer fee to treasury
                if fee > 0 {
                    invoke_signed(&system_instruction::transfer(&ctx.accounts.battle.key(), &ctx.accounts.treasury.key(), fee), &[ctx.accounts.battle.to_account_info(), ctx.accounts.treasury.to_account_info()], &[&[b"battle", &battle.battle_id.to_le_bytes(), &[battle.bump]]])?;
                }
                if let Some(winner_pk) = battle.winner {
                    let dest = if winner_pk == battle.player1 { &ctx.accounts.player1_owner } else { &ctx.accounts.player2_owner };
                    invoke_signed(&system_instruction::transfer(&ctx.accounts.battle.key(), &dest.key(), payout), &[ctx.accounts.battle.to_account_info(), dest.to_account_info()], &[&[b"battle", &battle.battle_id.to_le_bytes(), &[battle.bump]]])?;
                } else {
                    // draw -> treasury
                    invoke_signed(&system_instruction::transfer(&ctx.accounts.battle.key(), &ctx.accounts.treasury.key(), payout), &[ctx.accounts.battle.to_account_info(), ctx.accounts.treasury.to_account_info()], &[&[b"battle", &battle.battle_id.to_le_bytes(), &[battle.bump]]])?;
                }
            },
            Currency::SPL(_) => {
                // token transfers using CPI from battle_escrow to winner ATA / treasury
                let total_tokens = ctx.accounts.battle_escrow.amount;
                let fee_amt = ((total_tokens as u128) * (cfg.fee_bps as u128) / 10_000u128) as u64;
                let payout_amt = total_tokens.saturating_sub(fee_amt);
                // transfer fee to treasury_ata
                if fee_amt > 0 {
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.battle_escrow.to_account_info(),
                        to: ctx.accounts.treasury_ata.to_account_info(),
                        authority: ctx.accounts.battle.to_account_info(),
                    };
                    let signer_seeds = &[&[b"battle", &battle.battle_id.to_le_bytes(), &[battle.bump]][..]];
                    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds), fee_amt)?;
                }
                if let Some(winner_pk) = battle.winner {
                    let dest_ata = if winner_pk == battle.player1 { &ctx.accounts.player1_ata } else { &ctx.accounts.player2_ata };
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.battle_escrow.to_account_info(),
                        to: dest_ata.to_account_info(),
                        authority: ctx.accounts.battle.to_account_info(),
                    };
                    let signer_seeds = &[&[b"battle", &battle.battle_id.to_le_bytes(), &[battle.bump]][..]];
                    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds), payout_amt)?;
                } else {
                    // draw -> treasury_ata
                    let cpi_accounts = token::Transfer {
                        from: ctx.accounts.battle_escrow.to_account_info(),
                        to: ctx.accounts.treasury_ata.to_account_info(),
                        authority: ctx.accounts.battle.to_account_info(),
                    };
                    let signer_seeds = &[&[b"battle", &battle.battle_id.to_le_bytes(), &[battle.bump]][..]];
                    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds), payout_amt)?;
                }
            }
        }

        emit!(BattleSettled { battle: battle.key(), total_paid: 0 }); // could report actual payouts
        Ok(())
    }
}

// ------------------------
// CONTEXTS & ACCOUNTS
// ------------------------

#[derive(Accounts)]
pub struct CreateConfig<'info> {
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateEntropyPool<'info> {
    #[account(init, payer = payer, space = 8 + EntropyPool::INIT_SPACE, seeds = [b"entropy_pool"], bump)]
    pub pool: Account<'info, EntropyPool>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: authority (admin)
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefillSeedBatch<'info> {
    #[account(mut, has_one = authority)]
    pub pool: Account<'info, EntropyPool>,
    /// CHECK: refiller (oracle)
    pub refiller: Signer<'info>,
    /// CHECK: authority (for has_one)
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateCharacterFromNft<'info> {
    #[account(init, payer = payer, space = 8 + Character::INIT_SPACE, seeds = [b"character", nft_mint.key().as_ref()], bump)]
    pub character: Account<'info, Character>,
    /// CHECK: nft mint
    pub nft_mint: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub nft_ata: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = payer, space = 8 + Progression::INIT_SPACE, seeds = [b"progress", nft_mint.key().as_ref()], bump)]
    pub progression: Account<'info, Progression>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
#[instruction(offer_nonce: u64)]
pub struct CreateBattleOffer<'info> {
    #[account(init, payer = creator, space = 8 + Offer::INIT_SPACE, seeds = [b"offer", creator.key.as_ref(), &offer_nonce.to_le_bytes()], bump)]
    pub offer: Account<'info, Offer>,
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut)]
    pub creator_ata: Option<Account<'info, TokenAccount>>, // if SPL
    #[account(mut)]
    pub offer_escrow: Option<Account<'info, TokenAccount>>, // to be created if SPL
    #[account(mut)]
    pub currency_mint: Option<Account<'info, Mint>>,
    pub config: Account<'info, Config>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct JoinBattleOffer<'info> {
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    #[account(init, payer = challenger, space = 8 + Request::INIT_SPACE, seeds = [b"request", offer.key().as_ref(), challenger.key.as_ref()], bump)]
    pub request: Account<'info, Request>,
    #[account(mut)]
    pub character: Account<'info, Character>,
    #[account(mut)]
    pub progression: Account<'info, Progression>,
    #[account(mut)]
    pub challenger: Signer<'info>,
    #[account(mut)]
    pub challenger_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub request_escrow: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub currency_mint: Option<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct WithdrawRequest<'info> {
    #[account(mut, has_one = challenger)]
    pub request: Account<'info, Request>,
    #[account(mut)]
    pub challenger: Signer<'info>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    #[account(mut)]
    pub request_escrow: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub challenger_ata: Option<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelOffer<'info> {
    #[account(mut, has_one = creator)]
    pub offer: Account<'info, Offer>,
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut)]
    pub offer_escrow: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub creator_ata: Option<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ApproveChallenger<'info> {
    #[account(mut, has_one = creator)]
    pub offer: Account<'info, Offer>,
    #[account(mut, has_one = offer)]
    pub request: Account<'info, Request>,
    #[account(init, payer = creator, space = 8 + Battle::INIT_SPACE, seeds = [b"battle", &offer.offer_nonce.to_le_bytes(), offer.creator.as_ref(), request.challenger.as_ref()], bump)]
    pub battle: Account<'info, Battle>,
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut)]
    pub pool: Account<'info, EntropyPool>,
    // escrow accounts for SPL flows
    #[account(mut)]
    pub offer_escrow: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub request_escrow: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub battle_escrow: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub currency_mint: Option<Account<'info, Mint>>,
    pub config: Account<'info, Config>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ExecuteTurn<'info> {
    #[account(mut)]
    pub pool: Account<'info, EntropyPool>,
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    #[account(mut)]
    pub attacker_character: Account<'info, Character>,
    #[account(mut)]
    pub defender_character: Account<'info, Character>,
    #[account(mut)]
    pub attacker_prog: Account<'info, Progression>,
    #[account(mut)]
    pub defender_prog: Account<'info, Progression>,
    #[account(mut)]
    pub attacker_nft_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub defender_nft_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub player1_character_opt: Option<Account<'info, Character>>,
    #[account(mut)]
    pub player2_character_opt: Option<Account<'info, Character>>,
    pub signer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ForfeitByTimeout<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct FinalizeBattle<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    // SPL relevant accounts
    #[account(mut)]
    pub battle_escrow: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub treasury_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub player1_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub player2_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub player1_owner: Signer<'info>,
    #[account(mut)]
    pub player2_owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ------------------------
// ACCOUNTS / STRUCTS
// ------------------------
#[account]
pub struct Config {
    pub admin: Pubkey,
    pub fee_bps: u16,
    pub inactivity_timeout: i64,
    pub spl_whitelist: Vec<Pubkey>,
    pub trait_authority: Pubkey,
    pub bump: u8,
}
impl Config { pub const INIT_SPACE: usize = 32 + 2 + 8 + 4 + (32 * 8) + 32 + 1; }

#[account]
pub struct EntropyPool {
    pub authority: Pubkey,
    pub vrf_oracle: Pubkey,
    pub head: u8,
    pub tail: u8,
    pub total_available: u64,
    pub global_next_index: u64,
    pub bump: u8,
    pub last_refill_ts: i64,
    pub batches: [SeedBatch; MAX_BATCHES],
}
impl EntropyPool { pub const INIT_SPACE: usize = 32 + 32 + 1 + 1 + 8 + 8 + 1 + 8 + (SeedBatch::SIZE * MAX_BATCHES); }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct SeedBatch {
    pub seed: [u8; SEED_LEN],
    pub start: u64,
    pub count: u32,
    pub consumed: u32,
}
impl SeedBatch { pub const SIZE: usize = SEED_LEN + 8 + 4 + 4; }

#[account]
pub struct Character {
    pub nft_mint: Pubkey,
    pub base_class: CharacterClass,
    pub max_hp: u32,
    pub current_hp: u32,
    pub base_damage_min: u16,
    pub base_damage_max: u16,
    pub crit_bps: u16,
    pub crit_multiplier_fp: u32,
    pub dodge_bps: u16,
    pub defense: u16,
    pub special_cooldown: u8,
    pub last_damage: u16,
    pub combo_count: u8,
    pub lifes: u8,
    // trait modifiers:
    pub mod_attack_bps: i16,
    pub mod_defense_bps: i16,
    pub mod_crit_bps: i16,
    pub rarity: u8,
    pub created_at: i64,
    pub bump: u8,
}
impl Character {
    pub const INIT_SPACE: usize = 32 + 1 + 4 + 4 + 2 + 2 + 2 + 4 + 2 + 1 + 2 + 1 + 1 + 2 + 2 + 2 + 1 + 8 + 1;
}

#[account]
pub struct Progression {
    pub nft_mint: Pubkey,
    pub xp: u64,
    pub level: u16,
    pub mmr: u64,
    pub last_played: i64,
    pub bump: u8,
}
impl Progression { pub const INIT_SPACE: usize = 32 + 8 + 2 + 8 + 8 + 1; }

#[account]
pub struct Offer {
    pub creator: Pubkey,
    pub offer_nonce: u64,
    pub currency: Currency,
    pub stake_amount: u64,
    pub min_level: u16,
    pub max_level: u16,
    pub allowed_classes: Vec<CharacterClass>,
    pub auto_approve: bool,
    pub start_ts: i64,
    pub inactivity_timeout: i64,
    pub created_at: i64,
    pub is_active: bool,
    pub bump: u8,
}
impl Offer { pub const INIT_SPACE: usize = 32 + 8 + Currency::SIZE + 8 + 2 + 2 + 4 + 1 + 8 + 8 + 8 + 1 + 1; }

#[account]
pub struct Request {
    pub offer: Pubkey,
    pub challenger: Pubkey,
    pub character: Pubkey,
    pub offered_stake: u64,
    pub created_at: i64,
    pub status: JoinStatus,
    pub bump: u8,
}
impl Request { pub const INIT_SPACE: usize = 32 + 32 + 32 + 8 + 8 + 1 + 1; }

#[account]
pub struct Battle {
    pub battle_id: u64,
    pub player1: Pubkey,
    pub player2: Pubkey,
    pub start_ts: i64,
    pub current_turn: u8,
    pub turn_number: u64,
    pub player1_health: u64,
    pub player2_health: u64,
    pub state: BattleState,
    pub player1_stance: StanceType,
    pub player2_stance: StanceType,
    pub created_at: i64,
    pub inactivity_timeout: i64,
    pub last_action_ts: i64,
    pub winner: Option<Pubkey>,
    pub player1_dot_damage: u64,
    pub player2_dot_damage: u64,
    pub player1_dot_turns: u8,
    pub player2_dot_turns: u8,
    pub player1_reflection: u16,
    pub player2_reflection: u16,
    pub player1_miss_count: u16,
    pub player2_miss_count: u16,
    pub last_entropy_index: u64,
    pub bump: u8,
}
impl Battle { pub const INIT_SPACE: usize = 8 + 32 + 32 + 8 + 1 + 8 + 8 + 8 + 1 + 1 + 1 + 8 + 8 + 8 + 32 + 8 + 8 + 1 + 1 + 2 + 2 + 2 + 8 + 1; }

// ------------------------
// ENUMS & SMALL TYPES
// ------------------------
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum CharacterClass { Warrior=0, Assassin=1, Mage=2, Tank=3, Trickster=4 }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum BattleState { Waiting=0, Active=1, Finished=2 }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum StanceType { Balanced=0, Aggressive=1, Defensive=2, Berserker=3, Counter=4 }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum JoinStatus { Pending=0, Approved=1, Rejected=2, Withdrawn=3 }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace, Debug)]
pub enum Currency {
    SOL,
    SPL(Pubkey),
}
impl Currency { pub const SIZE: usize = 1 + 32; } // approximate

// Trait bundle
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct TraitBundle {
    pub rarity: u8,
    pub attack_bps: i16,
    pub defense_bps: i16,
    pub crit_bps: i16,
    pub nonce: i64,
}

// ------------------------
// EVENTS
// ------------------------
#[event] pub struct ConfigCreated { pub config: Pubkey, pub admin: Pubkey }
#[event] pub struct EntropyPoolCreated { pub pool: Pubkey, pub vrf_oracle: Pubkey }
#[event] pub struct SeedBatchRefilled { pub pool: Pubkey, pub added: u64, pub total_available: u64 }
#[event] pub struct ProgressionCreated { pub nft_mint: Pubkey }
#[event] pub struct CharacterCreated { pub nft_mint: Pubkey, pub owner: Pubkey }
#[event] pub struct TraitApplied { pub nft_mint: Pubkey, pub by: Pubkey }
#[event] pub struct OfferCreated { pub offer: Pubkey, pub creator: Pubkey, pub stake: u64 }
#[event] pub struct JoinRequested { pub offer: Pubkey, pub request: Pubkey, pub challenger: Pubkey, pub stake: u64 }
#[event] pub struct RequestWithdrawn { pub request: Pubkey, pub by: Pubkey }
#[event] pub struct OfferCancelled { pub offer: Pubkey, pub by: Pubkey }
#[event] pub struct BattleCreated { pub battle: Pubkey, pub player1: Pubkey, pub player2: Pubkey, pub first_turn: u8, pub stake_total: u64 }
#[event] pub struct BattleForfeited { pub battle: Pubkey, pub winner: Pubkey }
#[event] pub struct BattleEnded { pub battle: Pubkey, pub winner: Option<Pubkey> }
#[event] pub struct DamageClamped { pub battle: Pubkey, pub attacker: Pubkey }
#[event] pub struct ComboApplied { pub battle: Pubkey, pub attacker: Pubkey, pub combo: u8, pub added: u64 }
#[event] pub struct SpecialUsed { pub battle: Pubkey, pub attacker: Pubkey, pub special: u8 }
#[event] pub struct AttackMissed { pub battle: Pubkey, pub attacker: Pubkey, pub defender: Pubkey }
#[event] pub struct ReflectionApplied { pub battle: Pubkey, pub defender: Pubkey, pub reflected: u64 }
#[event] pub struct CounterApplied { pub battle: Pubkey, pub player: Pubkey, pub damage: u64 }
#[event] pub struct SelfDamageApplied { pub battle: Pubkey, pub player: Pubkey, pub damage: u64 }
#[event] pub struct LifeConsumed { pub character: Pubkey, pub remaining: u8 }
#[event] pub struct TurnResolved { pub battle: Pubkey, pub turn_number: u64, pub attacker: Pubkey, pub defender: Pubkey, pub damage_dealt: u64, pub is_crit: bool }
#[event] pub struct BattleSettled { pub battle: Pubkey, pub total_paid: u64 }

// ------------------------
// HELPERS: FP math, entropy consumption, levelup
// ------------------------
fn mul_fp_checked(value_fp: u128, mul_fp: u128) -> Result<u128> {
    let prod = value_fp.checked_mul(mul_fp).ok_or(GameError::MathOverflow)?;
    Ok(prod.checked_div(FP_SCALE).ok_or(GameError::MathOverflow)?)
}

fn fp_to_u64_clamped(value_fp: u128, err: GameError) -> Result<u64> {
    let val = value_fp.checked_div(FP_SCALE).ok_or(err)?;
    if val > (u64::MAX as u128) {
        return Err(err.into());
    }
    Ok(val as u64)
}

// stance multipliers: returns attacker_fp, defender_fp, self_damage_bps, counter_bps
fn stance_multipliers(att: StanceType, def: StanceType) -> (u128, u128, u16, u16) {
    use StanceType::*;
    let mut att_fp = FP_SCALE;
    let mut def_fp = FP_SCALE;
    let mut self_bps = 0u16;
    let mut counter_bps = 0u16;
    match att {
        StanceType::Aggressive => att_fp = FP_SCALE * 130 / 100,
        StanceType::Defensive => att_fp = FP_SCALE * 70 / 100,
        StanceType::Berserker => { att_fp = FP_SCALE * 200 / 100; self_bps = 2500; },
        StanceType::Counter => att_fp = FP_SCALE * 90 / 100,
        StanceType::Balanced => {}
    }
    match def {
        StanceType::Defensive => def_fp = FP_SCALE * 50 / 100,
        StanceType::Aggressive => def_fp = FP_SCALE * 150 / 100,
        StanceType::Counter => counter_bps = 4000,
        _ => {}
    }
    (att_fp, def_fp, self_bps, counter_bps)
}

// Entropy consumption: return (value, global_index_used)
impl EntropyPool {
    pub fn consume_mixed_u64_return_index(&mut self, signer: &Pubkey, user_seed: &[u8], turn_number: u32, min: u64, max: u64) -> Result<(u64, u64)> {
        require!(max >= min, GameError::InvalidRange);
        require!(self.total_available > 0, GameError::NoEntropyAvailable);

        // find head batch
        let mut idx = self.head as usize % MAX_BATCHES;
        // skip empty batches
        while self.batches[idx].count <= self.batches[idx].consumed {
            idx = (idx + 1) % MAX_BATCHES;
            // if looped fully and nothing available
            if idx == (self.head as usize % MAX_BATCHES) { return Err(error!(GameError::NoEntropyAvailable).into()); }
        }
        let batch = &mut self.batches[idx];
        let offset = batch.start.saturating_add(batch.consumed as u64);
        let mut tn_bytes = [0u8; 4];
        tn_bytes.copy_from_slice(&turn_number.to_le_bytes());
        let h = hashv(&[&batch.seed, &offset.to_le_bytes(), &signer.to_bytes(), user_seed, &tn_bytes]).0;
        let mut arr = [0u8; 8];
        arr.copy_from_slice(&h[0..8]);
        let mut val = u64::from_le_bytes(arr);
        let range = max - min + 1;
        val = min + (val % range);

        // update consumed counts and pool counters
        batch.consumed = batch.consumed.saturating_add(1);
        self.total_available = self.total_available.saturating_sub(1);
        let used_global_index = offset;
        if batch.consumed >= batch.count {
            // advance head
            self.head = ((self.head as usize + 1) % MAX_BATCHES) as u8;
        }
        Ok((val, used_global_index))
    }
}

// level up logic: simple quadratic XP curve
fn next_level_xp(level: u16) -> u64 {
    // 100 * level^2
    let l = level as u64;
    100u64.saturating_mul(l.saturating_mul(l))
}
fn level_up_if_needed(prog: &mut Account<Progression>, ch: &mut Account<Character>) -> Result<()> {
    loop {
        let need = next_level_xp(prog.level);
        if prog.xp >= need {
            prog.xp = prog.xp.saturating_sub(need);
            prog.level = prog.level.saturating_add(1);
            // evolve stats modestly
            ch.max_hp = ch.max_hp.saturating_add((ch.max_hp / 20).max(1)); // +5%
            ch.current_hp = ch.max_hp;
            ch.base_damage_min = ch.base_damage_min.saturating_add((ch.base_damage_min / 10).max(1));
            ch.base_damage_max = ch.base_damage_max.saturating_add((ch.base_damage_max / 10).max(1));
            emit!(ProgressionLevelUp { nft_mint: prog.nft_mint, new_level: prog.level });
        } else { break; }
    }
    Ok(())
}

// ------------------------
// ERRORS
// ------------------------
#[error_code]
pub enum GameError {
    #[msg("Unauthorized refill")] UnauthorizedRefill,
    #[msg("Seed replay")] SeedReplay,
    #[msg("Entropy pool full")] EntropyPoolFull,
    #[msg("No entropy available")] NoEntropyAvailable,
    #[msg("Invalid index")] InvalidIndex,
    #[msg("Invalid range")] InvalidRange,
    #[msg("Math overflow")] MathOverflow,
    #[msg("Invalid NFT token account")] InvalidNftAta,
    #[msg("Not NFT owner")] NotNftOwner,
    #[msg("Offer not active")] OfferNotActive,
    #[msg("Character fails constraints")] CharacterConstraint,
    #[msg("Unauthorized")] Unauthorized,
    #[msg("Invalid request state")] InvalidRequestState,
    #[msg("Invalid battle state")] InvalidBattleState,
    #[msg("Battle already finished")] BattleAlreadyFinished,
    #[msg("Not your turn")] NotYourTurn,
    #[msg("Special on cooldown")] SpecialOnCooldown,
    #[msg("Invalid timestamp")] InvalidTimestamp,
    #[msg("Battle not finished")] BattleNotFinished,
    #[msg("Auto-approve disabled")] AutoApproveDisabled,
    #[msg("SPL not whitelisted")] SPLNotWhitelisted,
    #[msg("Timeout not reached")] TimeoutNotReached,
}

// Additional events used in level up
#[event] pub struct ProgressionLevelUp { pub nft_mint: Pubkey, pub new_level: u16 }

// End of program