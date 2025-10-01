import { AppState } from "../state.js";
import { showLoading, showError, showSuccess, switchToSection } from "../ui.js";
import { getTokens, getTokenByAddress } from "../services/token-service.js";
import { getProvider } from "../wallet.js";
import { AMMContract } from "../amm-contract.js";

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

        console.log("loading create pool")

        // Populate token dropdowns (mock/demo)
        const tokens = await getTokens()
        const tokenASelect = document.getElementById("createPoolTokenA");
        const tokenBSelect = document.getElementById("createPoolTokenB");
        if (tokenASelect) {
            
              // Populate tokenASelect with token options (handle async symbols)
              Promise.all(tokens.map(async t => {
                const symbol = await t.symbol();
                return `<option value="${t.address}">${symbol}</option>`;
              })).then(options => {
                tokenASelect.innerHTML = `<option value="">Select Token</option>` + options.join("");
              });
              
        }
        if (tokenBSelect) {
           Promise.all(tokens.map(async t => {
                const symbol = await t.symbol();
                return `<option value="${t.address}">${symbol}</option>`;
              })).then(options => {
                tokenBSelect.innerHTML = `<option value="">Select Token</option>` + options.join("");
              });
        }

        // Reset balances and summary
        document.getElementById("createPoolTokenABalance").textContent = (await getTokenByAddress(document.getElementById("createPoolTokenA").value)?.balanceOf(getProvider().address))?.toString() || "0";
        document.getElementById("createPoolTokenBBalance").textContent = "0";
        document.getElementById("createPoolPair").textContent = "-";
        document.getElementById("createPoolInitialPrice").textContent = "-";
        document.getElementById("createPoolFee").textContent = "~0.001 MAS";

        tokenASelect.addEventListener("change", async (e)=>{
                document.getElementById("createPoolTokenABalance").textContent = (await getTokenByAddress(document.getElementById("createPoolTokenA").value)?.balanceOf(getProvider().address))?.toString() || "0";
        })

        tokenBSelect.addEventListener("change", async (e)=>{
                document.getElementById("createPoolTokenBBalance").textContent = (await getTokenByAddress(document.getElementById("createPoolTokenB").value)?.balanceOf(getProvider().address))?.toString() || "0";
        })


       

        // Attach event listeners for UI interactivity
        const amountAInput = document.getElementById("createPoolAmountA");
        const amountBInput = document.getElementById("createPoolAmountB");
        const feeTierSelect = document.getElementById("createPoolFeeTier");
        if (amountAInput && amountBInput && feeTierSelect) {
            amountAInput.addEventListener("input", updateCreatePoolSummary);
            amountBInput.addEventListener("input", updateCreatePoolSummary);
            feeTierSelect.addEventListener("change", updateCreatePoolSummary);
        }


         document.getElementById("createPoolForm").addEventListener("submit", async (e)=>{
          e.preventDefault()

          AMMContract.createPool(
            tokenASelect.value,
            tokenBSelect.value,
            amountAInput.value,
            amountBInput.value,
            "100"
          )
          
        })

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
    const tokenA = document.getElementById("createPoolTokenA")?.value || "-";
    const tokenB = document.getElementById("createPoolTokenB")?.value || "-";
    const amountA = parseFloat(document.getElementById("createPoolAmountA")?.value || "0");
    const amountB = parseFloat(document.getElementById("createPoolAmountB")?.value || "0");
    const feeTier = document.getElementById("createPoolFeeTier")?.value || "-";

    document.getElementById("createPoolPair").textContent = `${tokenA.slice(0,4)}/${tokenB.slice(0,4)}`;
    document.getElementById("createPoolInitialPrice").textContent =
        amountB > 0 ? (amountA / amountB).toFixed(4) : "-";
    document.getElementById("createPoolFee").textContent = `~0.001 MAS (${feeTier}%)`;
}

export function openCreatePoolModal() {
    // Switch to the createPool section and load its data
    switchToSection("createPool");
    loadCreatePoolData()
      .then(()=> console.log("done"))
      .catch((e)=> console.log(e))
    showSuccess("Create Pool section opened!");
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
