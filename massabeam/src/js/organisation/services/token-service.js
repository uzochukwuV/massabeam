import { MRC20 } from "@massalabs/massa-web3";
import { showError } from "../ui.js";
import {TOKENS_LIST } from "../contracts-config.js"
import { getProvider } from "../wallet.js";

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

        const tokenPromises = TOKENS_LIST.map(async (x) => {
            console.log(x.address)
            console.log("AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk")
            console.log(provider)
            const token = new MRC20(provider, "AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk");
            const symbol = x.symbol;
            const decimals = x.decimals;
            const balance = await token.balanceOf("AU12G4TFGs7EFxAd98sDyW2qni8LMwy6QPoNuDao2DmF3NdCun7ma");
            console.log(balance)
            return {
                address : x.address,
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
