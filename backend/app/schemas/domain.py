"""
Domain schemas for API responses.
These extend the base Pydantic models with read-specific schemas.
"""
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

# Import from models
import sys
from pathlib import Path

# Add models directory to path
models_path = Path(__file__).parent.parent.parent / "models"
if str(models_path) not in sys.path:
    sys.path.insert(0, str(models_path))

from enums import AgentStatus, DiscussionStatus
from schemas import (
    CandlePoint,
    AgentPersonality,
    Agent as AgentBase,
    Message as MessageBase,
    Discussion as DiscussionBase,
    Sector as SectorBase,
)


# Re-export base models
__all__ = [
    "AgentStatus",
    "DiscussionStatus",
    "CandlePoint",
    "AgentPersonality",
    "AgentRead",
    "MessageRead",
    "DiscussionRead",
    "DiscussionSummary",
    "SectorRead",
    "SectorSummary",
]


class AgentRead(AgentBase):
    """Agent read schema with sector metadata."""
    sectorName: Optional[str] = None
    sectorSymbol: Optional[str] = None
    performanceHistory: List[float] = Field(default_factory=list)  # Performance values over time


class MessageRead(MessageBase):
    """Message read schema."""
    pass


class DiscussionSummary(BaseModel):
    """Summary of a discussion for listing endpoints."""
    id: str
    sectorId: str
    sectorSymbol: Optional[str] = None
    title: str
    status: DiscussionStatus
    agentIds: List[str] = Field(default_factory=list)
    messagesCount: int = 0
    createdAt: str  # ISO 8601 datetime string
    updatedAt: str  # ISO 8601 datetime string


class DiscussionRead(BaseModel):
    """Full discussion read schema with messages."""
    id: str
    sectorId: str
    title: str
    status: DiscussionStatus
    agentIds: List[str] = Field(default_factory=list)
    messages: List[MessageRead] = Field(default_factory=list)
    createdAt: str
    updatedAt: str


class SectorSummary(BaseModel):
    """Summary of a sector for listing endpoints."""
    id: str
    name: str
    symbol: str
    createdAt: str
    currentPrice: float = 0.0
    change: float = 0.0
    changePercent: float = 0.0
    volume: int = 0
    agentsCount: int = 0
    activeAgentsCount: int = 0
    discussionsCount: int = 0
    utilization: float = 0.0  # Utilization percentage (0-100)
    miniChart: List[CandlePoint] = Field(default_factory=list)  # Last N points for mini chart


class SectorRead(SectorBase):
    """Full sector read schema with nested data."""
    pass
