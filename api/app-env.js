/**
 * Vercel Serverless Function: App Environment
 * Returns the current environment ("demo" or "production") to the frontend.
 * Driven by the APP_ENV environment variable set in Vercel's dashboard.
 */
export default function handler(req, res) {
  const env = process.env.APP_ENV || "demo";

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({ env });
}
