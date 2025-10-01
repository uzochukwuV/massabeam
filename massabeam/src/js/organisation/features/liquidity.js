import { AppState } from "../state.js";
import { showLoading, showError, showSuccess, switchToSection } from "../ui.js";
import { getTokens, getTokenByAddress } from "../services/token-service.js";
import { getProvider } from "../wallet.js";
import { AMMContract } from "../amm-contract.js";
import { TOKENS_LIST, TOKEN_METADATA } from "../contracts-config.js";

// Load liquidity management data (your pools, all pools, etc.)
export async function loadLiquityData() {
    try {
        showLoading(true);

        // Fetch user's pools (mock/demo)
        const userPoolsList = document.getElementById("userPoolsList");
        if (userPoolsList) {
            // Example mock data
            const userPools = [
                { id: 1, pair: "MAS/USDC", liquidity: 12000, rewards: "MAS", apr: 45.2 },
                { id: 2, pair: "WETH/USDC", liquidity: 8000, rewards: "WETH", apr: 32.8 },
            ];
            if (userPools.length === 0) {
                userPoolsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">💧</div>
                        <p>No liquidity positions found</p>
                        <button class="secondary-btn" onclick="openCreatePoolModal()">Add Liquidity</button>
                    </div>
                `;
            } else {
                userPoolsList.innerHTML = userPools.map(pool => `
                    <div class="pool-row">
                        <div class="pool-pair">${pool.pair}</div>
                        <div class="pool-liquidity">Liquidity: $${pool.liquidity.toLocaleString()}</div>
                        <div class="pool-apr">APR: ${pool.apr}%</div>
                        <div class="pool-rewards">Rewards: ${pool.rewards}</div>
                        <button class="secondary-btn" onclick="openStakeModal(${pool.id})">Stake</button>
                        <button class="secondary-btn" onclick="openUnstakeModal(${pool.id})">Unstake</button>
                    </div>
                `).join("");
            }
        }

        // Fetch all pools (mock/demo)
        const allPoolsList = document.getElementById("allPoolsList");
        if (allPoolsList) {
            const allPools = [
                { pair: "MAS/USDC", liquidity: 125000, apr: 45.2 },
                { pair: "WETH/USDC", liquidity: 89000, apr: 32.8 },
                { pair: "DAI/USDC", liquidity: 67000, apr: 18.5 },
            ];
            if (allPools.length === 0) {
                allPoolsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🏊</div>
                        <p>No pools available</p>
                    </div>
                `;
            } else {
                allPoolsList.innerHTML = allPools.map(pool => `
                    <div class="pool-row">
                        <div class="pool-pair">${pool.pair}</div>
                        <div class="pool-liquidity">Liquidity: $${pool.liquidity.toLocaleString()}</div>
                        <div class="pool-apr">APR: ${pool.apr}%</div>
                        <button class="primary-btn" onclick="openCreatePoolModal()">Add Liquidity</button>
                    </div>
                `).join("");
            }
        }

        // Update pool stats
        const activePoolCount = document.getElementById("activePoolCount");
        const totalLiquidityProvided = document.getElementById("totalLiquidityProvided");
        if (activePoolCount) activePoolCount.textContent = "2"; // mock
        if (totalLiquidityProvided) totalLiquidityProvided.textContent = "$20,000"; // mock

        showSuccess("Liquidity data loaded!");
    } catch (error) {
        showError("Failed to load liquidity data.");
        console.error(error);
    } finally {
        showLoading(false);
    }
}

// Load create pool section data (populate token dropdowns, etc.)
export async function loadCreatePoolData() {
    try {
        showLoading(true);

        console.log("Loading create pool with deployed tokens:", TOKENS_LIST);

        const tokenASelect = document.getElementById("createPoolTokenA");
        const tokenBSelect = document.getElementById("createPoolTokenB");

        // Populate token dropdowns with deployed tokens
        if (tokenASelect) {
            const options = TOKENS_LIST.map(token =>
                `<option value="${token.address}">${token.symbol} - ${token.name}</option>`
            ).join("");
            tokenASelect.innerHTML = `<option value="">Select Token A</option>` + options;
        }

        if (tokenBSelect) {
            const options = TOKENS_LIST.map(token =>
                `<option value="${token.address}">${token.symbol} - ${token.name}</option>`
            ).join("");
            tokenBSelect.innerHTML = `<option value="">Select Token B</option>` + options;
        }

        // Reset balances and summary
        document.getElementById("createPoolTokenABalance").textContent = "0.00";
        document.getElementById("createPoolTokenBBalance").textContent = "0.00";
        document.getElementById("createPoolPair").textContent = "-";
        document.getElementById("createPoolInitialPrice").textContent = "-";
        document.getElementById("createPoolFee").textContent = "~0.001 MAS";

        // Update balance when token A changes
        tokenASelect.addEventListener("change", async (e) => {
            const selectedAddress = e.target.value;
            if (!selectedAddress) {
                document.getElementById("createPoolTokenABalance").textContent = "0.00";
                return;
            }

            try {
                const provider = getProvider();
                if (!provider) return;

                const tokenContract = await getTokenByAddress(selectedAddress);
                const balance = await tokenContract.balanceOf(provider.address);
                const decimals = await tokenContract.decimals();

                // Convert u256 balance to human-readable
                const balanceFormatted = Number(balance.toString()) / (10 ** Number(decimals));
                document.getElementById("createPoolTokenABalance").textContent = balanceFormatted.toFixed(2);
            } catch (error) {
                console.error("Error fetching Token A balance:", error);
                document.getElementById("createPoolTokenABalance").textContent = "Error";
            }
        });

        // Update balance when token B changes
        tokenBSelect.addEventListener("change", async (e) => {
            const selectedAddress = e.target.value;
            if (!selectedAddress) {
                document.getElementById("createPoolTokenBBalance").textContent = "0.00";
                return;
            }

            try {
                const provider = getProvider();
                if (!provider) return;

                const tokenContract = await getTokenByAddress(selectedAddress);
                const balance = await tokenContract.balanceOf(provider.address);
                const decimals = await tokenContract.decimals();

                // Convert u256 balance to human-readable
                const balanceFormatted = Number(balance.toString()) / (10 ** Number(decimals));
                document.getElementById("createPoolTokenBBalance").textContent = balanceFormatted.toFixed(2);
            } catch (error) {
                console.error("Error fetching Token B balance:", error);
                document.getElementById("createPoolTokenBBalance").textContent = "Error";
            }
        });


       

        // Attach event listeners for UI interactivity
        const amountAInput = document.getElementById("createPoolAmountA");
        const amountBInput = document.getElementById("createPoolAmountB");
        const feeTierSelect = document.getElementById("createPoolFeeTier");
        if (amountAInput && amountBInput && feeTierSelect) {
            amountAInput.addEventListener("input", updateCreatePoolSummary);
            amountBInput.addEventListener("input", updateCreatePoolSummary);
            feeTierSelect.addEventListener("change", updateCreatePoolSummary);
        }


        // Handle form submission
        const createPoolForm = document.getElementById("createPoolForm");
        if (createPoolForm) {
            createPoolForm.addEventListener("submit", async (e) => {
                e.preventDefault();

                const tokenA = tokenASelect.value;
                const tokenB = tokenBSelect.value;
                const amountA = amountAInput.value;
                const amountB = amountBInput.value;

                // Validation
                if (!tokenA || !tokenB) {
                    showError("Please select both tokens");
                    return;
                }

                if (tokenA === tokenB) {
                    showError("Cannot create pool with same token");
                    return;
                }

                if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) {
                    showError("Please enter valid amounts");
                    return;
                }

                try {
                    showLoading(true);

                    // Deadline is 1 hour from now (in milliseconds)
                    const deadline = Date.now() + (60 * 60 * 1000);

                    console.log("Creating pool:", {
                        tokenA,
                        tokenB,
                        amountA,
                        amountB,
                        deadline
                    });

                    await AMMContract.createPool(
                        tokenA,
                        tokenB,
                        amountA,
                        amountB,
                        deadline
                    );

                    showSuccess("Pool created successfully! 🎉");

                    // Reset form
                    createPoolForm.reset();
                    updateCreatePoolSummary();
                } catch (error) {
                    console.error("Create pool error:", error);
                    showError(`Failed to create pool: ${error.message}`);
                } finally {
                    showLoading(false);
                }
            });
        }

        showSuccess("Create Pool UI ready!");
    } catch (error) {
        showError("Failed to load create pool data.");
        console.error(error);
    } finally {
        showLoading(false);
    }
}

// Helper to update create pool summary UI
function updateCreatePoolSummary() {
    const tokenAAddress = document.getElementById("createPoolTokenA")?.value || "";
    const tokenBAddress = document.getElementById("createPoolTokenB")?.value || "";
    const amountA = parseFloat(document.getElementById("createPoolAmountA")?.value || "0");
    const amountB = parseFloat(document.getElementById("createPoolAmountB")?.value || "0");
    const feeTier = document.getElementById("createPoolFeeTier")?.value || "0.3";

    // Find token symbols from metadata
    const tokenASymbol = TOKENS_LIST.find(t => t.address === tokenAAddress)?.symbol || "?";
    const tokenBSymbol = TOKENS_LIST.find(t => t.address === tokenBAddress)?.symbol || "?";

    document.getElementById("createPoolPair").textContent = `${tokenASymbol}/${tokenBSymbol}`;
    document.getElementById("createPoolInitialPrice").textContent =
        amountB > 0 ? `1 ${tokenASymbol} = ${(amountB / amountA).toFixed(6)} ${tokenBSymbol}` : "-";
    document.getElementById("createPoolFee").textContent = `~0.001 MAS (${feeTier}% swap fee)`;
}

export function openCreatePoolModal() {
    // Switch to the createPool section and load its data
    switchToSection("createPool");
    loadCreatePoolData()
      .then(()=> console.log("done"))
      .catch((e)=> console.log(e))
    showSuccess("Create Pool section opened!");
}

// Refresh pools data
export function refreshPools() {
    loadLiquityData()
        .then(() => console.log("Pools refreshed"))
        .catch((e) => console.error("Failed to refresh pools:", e));
}

async function handleAddLiquidity(event) {
    event.preventDefault();

    if (!AppState.user.connected) {
        await handleWalletConnection();
        return;
    }

    try {
        showLoading(true);

        const tokenA = document.getElementById('liquidityTokenA')?.value;
        const tokenB = document.getElementById('liquidityTokenB')?.value;
        const amountA = document.getElementById('liquidityAmountA')?.value;
        const amountB = document.getElementById('liquidityAmountB')?.value;
        const slippage = "0.5"; // or get from UI
        const deadline = Date.now() + 60 * 60 * 1000; // 1 hour from now

        if (!tokenA || !tokenB || !amountA || !amountB) {
            showError("Please fill in all liquidity fields.");
            showLoading(false);
            return;
        }

        const amountADesired = parseFloat(amountA);
        const amountBDesired = parseFloat(amountB);
        const amountAMin = amountADesired * (1 - parseFloat(slippage) / 100);
        const amountBMin = amountBDesired * (1 - parseFloat(slippage) / 100);

        await AMMContract.addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, deadline);

        showSuccess("Liquidity added!");
        await loadLiquityData();

    } catch (error) {
        console.error("Add liquidity failed:", error);
        showError("Add liquidity failed. Please try again.");
    } finally {
        showLoading(false);
    }
}

export function setupLiquidityEventListeners() {
    const addLiquidityForm = document.getElementById("addLiquidityForm");
    if (addLiquidityForm) {
        addLiquidityForm.addEventListener("submit", handleAddLiquidity);
    }
}
