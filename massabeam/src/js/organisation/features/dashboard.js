import { updateDashboard } from "../ui.js";
import { AppState } from "../state.js";

// Load dashboard data
export async function loadDashboardData() {
  try {
    updateDashboard(AppState)
  } catch (error) {
    console.error("Failed to load dashboard data:", error)
  }
}
