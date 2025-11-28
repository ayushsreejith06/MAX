"""
FastAPI application entrypoint for MAX backend.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
from app.api import sectors, agents, discussions
from app.realtime import sio

app = FastAPI(
    title="MAX Backend API",
    description="REST API for MAX - Managing sectors, agents, and discussions",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create Socket.IO ASGI app and mount it
socketio_app = socketio.ASGIApp(sio, app)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}

# Register routers
app.include_router(sectors.router, prefix="/api/sectors", tags=["sectors"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(discussions.router, prefix="/api/discussions", tags=["discussions"])

# Export the Socket.IO app as the main ASGI application
# This allows Socket.IO to handle WebSocket connections at /socket.io/
asgi_app = socketio_app

if __name__ == "__main__":
    import uvicorn
    # Run the Socket.IO app which wraps the FastAPI app
    uvicorn.run(socketio_app, host="0.0.0.0", port=8000)

