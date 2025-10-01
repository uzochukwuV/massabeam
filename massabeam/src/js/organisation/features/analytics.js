import { initializeCharts } from "../ui.js";

// Load analytics data
export async function loadAnalyticsData() {
  try {
    // Load analytics charts and data
    console.log("Loading analytics data...")
    initializeCharts()
  } catch (error) {
    console.error("Failed to load analytics data:", error)
  }
}
