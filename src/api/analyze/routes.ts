import express, { Request, Response } from "express"
import { analyzeTeamCapacity, formatCapacityAnalysis, type CapacityCandidate } from "../../lib/capacityAnalyzer.js"

const router = express.Router()

console.log("[Analyze Routes] Router created and loaded")

// Debug: log all requests
router.use((req: Request, res: Response, next) => {
  console.log("[Analyze Routes] Incoming request:", req.method, req.originalUrl, req.url, req.path)
  next()
})

/**
 * POST /api/analyze/capacity
 * Analyzes team capacity based on base hours, PTO, and holidays
 */
router.post("/capacity", async (req: Request, res: Response) => {
  try {
    const { candidates } = req.body as { candidates: CapacityCandidate[] }

    // Validation
    if (!candidates || !Array.isArray(candidates)) {
      return res.status(400).json({
        error: "Candidates array is required",
      })
    }

    if (candidates.length === 0) {
      return res.status(400).json({
        error: "At least one candidate is required",
      })
    }

    console.log("[Capacity Analysis] Analyzing capacity for", candidates.length, "employees")

    // Analyze team capacity
    const analysis = analyzeTeamCapacity(candidates)
    console.log("[Capacity Analysis] Analysis computed")
    
    const formatted = formatCapacityAnalysis(analysis)
    console.log("[Capacity Analysis] Analysis formatted")

    console.log("[Capacity Analysis] Analysis complete:", {
      total_available: formatted.total_available_capacity,
      total_base: formatted.total_base_capacity,
      utilization: formatted.capacity_utilization_percent + "%",
    })

    console.log("[Capacity Analysis] Returning response with", formatted.team_capacity.length, "employees")
    return res.json(formatted.team_capacity)
  } catch (error) {
    console.error("[Capacity Analysis] Error:", error)
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

// Catch-all for debugging
router.use((req: Request, res: Response) => {
  console.log("[Analyze Routes] Catch-all handler:", req.method, req.path)
  res.json({ error: "No matching route in analyze router", path: req.path, method: req.method })
})

export default router
