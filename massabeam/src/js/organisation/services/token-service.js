import { MRC20 } from "@massalabs/massa-web3";
import { getProvider } from "../wallet.js";
import { showError } from "../ui.js";

const TOKENS = [
  "AS1CEhhk1dqe2HpVG7AxKvVCdMVjsbSqLJPbZMmvyzV4gJShsfjV",
  "AS122GRtTijhmh48MLCmqLVqTet4r5JDzvZZCKSsJrCWTSWjyD6Kz",
];

let tokensCache = null;

export async function getTokens() {
    if (tokensCache) {
        return tokensCache;
    }

    try {
        const provider = getProvider();
        if (!provider) {
            throw new Error("Provider not initialized");
        }

        const tokenPromises = TOKENS.map(async (address) => {
            const token = new MRC20(provider, address);
            const symbol = await token.symbol();
            const decimals = await token.decimals();
            return {
                address,
                symbol,
                decimals,
                contract: token
            };
        });

        const tokens = await Promise.all(tokenPromises);
        console.log("Available tokens:", tokens);
        tokensCache = tokens;
        return tokens;
    } catch (error) {
        console.error("Error loading tokens:", error);
        return [];
    }
}

// Get token by address
export async function getTokenByAddress(address) {
    const tokens = await getTokens();
    const token = tokens.find(t => t.address === address);
    return token ? token.contract : null;
}

// Get token by symbol
export async function getTokenBySymbol(symbol) {
  const tokens = await getTokens();
  return tokens.find(async (token) => await token.symbol() === symbol)
}

// Add a function to populate token dropdowns
export async function populateTokenDropdowns() {
    try {
        const tokens = await getTokens();
        const dropdowns = document.querySelectorAll('.token-select');
        
        dropdowns.forEach(dropdown => {
            dropdown.innerHTML = `
                <option value="">Select Token</option>
                ${tokens.map(token => `
                    <option value="${token.address}">
                        ${token.symbol}
                    </option>
                `).join('')}
            `;
        });
    } catch (error) {
        console.error("Failed to populate token dropdowns:", error);
        showError("Failed to load tokens");
    }
}
