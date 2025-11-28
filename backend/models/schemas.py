"""
Base Pydantic schemas for MAX domain models.
These are the base schemas that are extended in app/schemas/domain.py.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class CandlePoint(BaseModel):
    """Candle data point for sector price charts."""
    time: str  # Format: "HH:MM" (e.g., "14:30")
    value: float  # Price/index value


class AgentPersonality(BaseModel):
    """Agent personality traits."""
    riskTolerance: Optional[str] = None
    decisionStyle: Optional[str] = None
    communicationStyle: Optional[str] = None
    
    class Config:
        extra = "allow"  # Allow additional personality traits


class Agent(BaseModel):
    """Base agent schema."""
    id: str
    name: str
    role: str
    status: str  # AgentStatus enum as string
    performance: float = 0.0
    trades: int = 0
    sectorId: str
    personality: AgentPersonality
    createdAt: str  # ISO 8601 datetime string


class Message(BaseModel):
    """Base message schema."""
    id: str
    discussionId: str
    agentId: Optional[str] = None
    agentName: str
    content: str
    timestamp: str  # ISO 8601 datetime string


class Discussion(BaseModel):
    """Base discussion schema."""
    id: str
    sectorId: str
    title: str
    status: str  # DiscussionStatus enum as string
    agentIds: List[str] = Field(default_factory=list)
    messages: List[Message] = Field(default_factory=list)
    createdAt: str  # ISO 8601 datetime string
    updatedAt: str  # ISO 8601 datetime string


class Sector(BaseModel):
    """Base sector schema."""
    id: str
    name: str
    symbol: str
    createdAt: str  # ISO 8601 datetime string
    currentPrice: float = 0.0
    change: float = 0.0
    changePercent: float = 0.0
    volume: int = 0
    agents: List[Agent] = Field(default_factory=list)
    discussions: List[Discussion] = Field(default_factory=list)
    candleData: List[CandlePoint] = Field(default_factory=list)

