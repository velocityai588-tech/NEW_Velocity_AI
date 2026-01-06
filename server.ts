/*
  WARNING: This server file was intentionally disabled.

  A contributor accidentally deployed the backend to Render. To avoid exposing
  third-party API keys or continuing the unintended Render deployment, this
  file has been replaced with a safe stub that responds with 410 Gone for the
  main API routes. The original implementation was moved to
  `backend_disabled/server.disabled.ts` for audit/history.

  Next steps:
  - If you want to re-enable this backend on Vercel, deploy server functions
    from the `api/` folder or recreate an appropriate Vercel serverless entry.
  - To remove the running Render service, remove it from the Render dashboard
    or use the Render API (see repository docs / instructions).
*/

import express from "express"

const app = express()

app.use((req, res, next) => {
  // Respond 410 for API routes to indicate the service has been intentionally disabled
  if (req.path.startsWith('/api') || req.path === '/health') {
    res.status(410).json({ error: 'This backend has been disabled. Deploy to Vercel instead.' })
    return
  }
  next()
})

// Keep process alive on platforms expecting an HTTP server
const PORT = Number(process.env.PORT || process.env.API_PORT || 4000)
app.listen(PORT, () => {
  console.log(`Disabled API placeholder listening on port ${PORT}`)
})
