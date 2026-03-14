# GitHub Copilot Instructions for SmartContainer Risk Engine

## Project Overview
SmartContainer Risk Engine is an AI-powered customs container risk screening platform that classifies container shipments into **Critical**, **Low Risk**, or **Clear** tiers using an ensemble ML model (XGBoost + Random Forest + Isolation Forest).

## Tech Stack
- **Frontend**: React 19, TypeScript, Vite, TailwindCSS
- **Backend**: Node.js 18+, Express 4, Vercel serverless functions
- **Database**: MongoDB Atlas
- **ML Service**: Python 3.11+, FastAPI, scikit-learn, XGBoost
- **Cache**: Redis (optional)
- **Real-time**: Socket.IO, React Query polling

## Code Style Guidelines
- Use TypeScript strict mode for all frontend code
- Follow RESTful API conventions in the backend
- Use async/await over raw Promises
- Keep React components functional with hooks
- Use TailwindCSS utility classes for styling (no custom CSS unless necessary)
- Python code should follow PEP 8 with type hints

## Key Domains
- `backend/src/` — Express routes, controllers, and services
- `frontend/src/` — React components, hooks, and pages
- `backend/ml-service/` — Python FastAPI ML inference service

## Security
- Never log sensitive shipment data or PII
- Always validate and sanitise incoming request payloads
- Use environment variables for secrets (see `.env.example`)

## Testing
- Backend: use existing test helpers in `backend/scripts/`
- Frontend: use Vitest with React Testing Library patterns already in the project
