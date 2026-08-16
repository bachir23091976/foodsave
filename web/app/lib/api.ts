// Base URL of the FoodSave backend API.
// In production (Vercel), set NEXT_PUBLIC_API_URL to the deployed backend URL
// (e.g. https://foodsave-api-pgrf.onrender.com). Falls back to localhost:4000
// for local development only.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
