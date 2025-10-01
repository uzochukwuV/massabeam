import { Args } from "@massalabs/massa-web3";
import { callContract, readContract } from "./contract-helpers.js";
import { showError, showSuccess } from "./ui.js";

const CONTRACTS = {
  ENGINE: "AS12WoA6iCq17kiGA55izZMYhdrbosGRU4hVqfk5cbYgvVstUC9Md",
}

// Arbitrage Engine Contract Functions
export const ArbitrageContract = {
  // Start arbitrage engine
  async startArbitrageEngine() {
    try {
      const operation = await callContract(CONTRACTS.ENGINE, "startArbitrageEngine", [])
      showSuccess("Arbitrage engine started!")
      return operation
    } catch (error) {
      showError(`Failed to start arbitrage engine: ${error.message}`)
      throw error
    }
  },

  // Stop arbitrage engine
  async stopArbitrageEngine() {
    try {
      const operation = await callContract(CONTRACTS.ENGINE, "stopArbitrageEngine", [])
      showSuccess("Arbitrage engine stopped!")
      return operation
    } catch (error) {
      showError(`Failed to stop arbitrage engine: ${error.message}`)
      throw error
    }
  },

  // Detect arbitrage opportunities
  async detectArbitrageOpportunities() {
    try {
      const result = await readContract(CONTRACTS.ENGINE, "detectAllArbitrageOpportunities", [])
      return result
    } catch (error) {
      console.error("Failed to detect arbitrage opportunities:", error)
      return []
    }
  },

  // Execute arbitrage opportunity
  async executeArbitrageOpportunity(opportunityId) {
    try {
      const args = new Args()
      .addString(opportunityId)
      .serialize()
      const operation = await callContract(CONTRACTS.ENGINE, "executeArbitrageOpportunity", args)
      showSuccess("Arbitrage opportunity executed!")
      return operation
    } catch (error) {
      showError(`Failed to execute arbitrage: ${error.message}`)
      throw error
    }
  },
}
