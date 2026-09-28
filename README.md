# VIGIL - Rapid Help Emergency Dispatch System

VIGIL is an AI-powered emergency dispatch system designed to handle emergency calls, extract critical information, and relay it to a live operator dashboard in real-time.

## Features

*   **AI Voice Agent**: An intelligent, voice-driven emergency operator powered by Gemini that talks to citizens, asks targeted questions (emergency type, location, casualties), and automatically creates dispatch incidents.
*   **Resilient Fallback**: If the primary AI model is overloaded, VIGIL automatically cascades to alternative models, and finally to a robust rule-based NLP fallback to ensure emergencies are always handled.
*   **Real-time Mission Control Dashboard**: A live dashboard for human operators that updates instantly when new incidents are reported, powered by WebSockets.
*   **Live Map Integration**: Interactive Leaflet map displaying incident locations in real-time.
*   **Multi-language Support**: Voice recognition designed to support diverse callers while maintaining English standardization for operators.

## Tech Stack

*   **Frontend**: React, TypeScript, Vite, Tailwind CSS, Zustand (State Management), React Query, Leaflet (Maps).
*   **Backend**: Python, FastAPI, SQLAlchemy (Async), Uvicorn.
*   **AI/ML**: Google GenAI (Gemini Flash), Web Speech API.
*   **Database**: PostgreSQL (via Supabase).
*   **Real-time**: WebSockets with an outbox pattern for guaranteed delivery.

## Getting Started

### Prerequisites
*   Node.js (v18+)
*   Python (3.10+)
*   Supabase PostgreSQL database
*   Google Gemini API Key

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Configure environment variables in `.env`:
   ```env
   DATABASE_URL=postgresql+asyncpg://...
   GEMINI_API_KEY=your-gemini-api-key
   GEMINI_MODEL=gemini-2.5-flash-lite
   ```
4. Run the server:
   ```bash
   python -m uvicorn app.main:app --reload
   ```
   The backend will run on `http://localhost:8000`.

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   The frontend will run on `http://localhost:5173`.

## Architecture

1.  **Citizen Flow**: The citizen visits the portal, initiates an emergency call. The browser uses the Web Speech API for STT and sends transcripts over a WebSocket.
2.  **AI Engine**: The backend agent processes the transcript, maintaining context, and queries the Gemini API to formulate a response and extract incident metadata.
3.  **Realtime Sync**: Upon incident creation, a transactional outbox pattern publishes the event to connected operator dashboards over WebSockets, invalidating React Query caches to pull the latest state without page reloads.
