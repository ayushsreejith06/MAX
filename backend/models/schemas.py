"""
Pydantic schemas for MAX domain models.

These schemas define the structure and validation rules for all domain entities
in the MAX system. No database layer yet - pure domain models.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

from .enums import AgentStatus, DiscussionStatus


class CandlePoint(BaseModel):
    """Represents a single candle data point (5-minute increment)."""
    
    time: str = Field(
        ...,
        description="Time in HH:MM format - 5-minute increments, 288 points per day",
        pattern=r"^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
    )
    value: float = Field(..., description="Price/index level", ge=0)
    
    @field_validator("time")
    @classmethod
    def validate_time_format(cls, v: str) -> str:
        """Validate time is in HH:MM format."""
        parts = v.split(":")
        if len(parts) != 2:
            raise ValueError("Time must be in HH:MM format")
        hour, minute = int(parts[0]), int(parts[1])
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError("Time must be valid (00:00-23:59)")
        return v


class AgentPersonality(BaseModel):
    """Agent personality traits affecting trading behavior."""
    
    riskTolerance: str = Field(
        ...,
        description="Risk tolerance level (e.g., 'Low', 'Medium', 'High', 'Aggressive')"
    )
    decisionStyle: str = Field(
        ...,
        description="Decision making style (e.g., 'Analytical', 'Intuitive', 'Balanced')"
    )


class Agent(BaseModel):
    """Represents a trading agent in the MAX system."""
    
    id: str = Field(..., description="Unique agent identifier")
    name: str = Field(..., min_length=1, description="Agent name")
    role: str = Field(..., min_length=1, description="Agent role/function")
    status: AgentStatus = Field(..., description="Current agent status")
    performance: float = Field(
        ...,
        description="Performance as percentage return",
        ge=-100.0
    )
    trades: int = Field(..., description="Number of trades executed", ge=0)
    sectorId: str = Field(..., description="Sector this agent belongs to")
    personality: AgentPersonality = Field(..., description="Agent personality traits")
    createdAt: str = Field(..., description="ISO 8601 timestamp of creation")
    
    @field_validator("createdAt")
    @classmethod
    def validate_iso_timestamp(cls, v: str) -> str:
        """Validate ISO 8601 timestamp format."""
        try:
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("createdAt must be a valid ISO 8601 timestamp")
        return v


class Message(BaseModel):
    """Represents a message in a discussion."""
    
    id: str = Field(..., description="Unique message identifier")
    discussionId: str = Field(..., description="Discussion this message belongs to")
    agentId: str = Field(..., description="Agent who sent the message")
    agentName: str = Field(..., min_length=1, description="Name of the agent")
    content: str = Field(..., description="Message content")
    timestamp: str = Field(..., description="ISO 8601 timestamp of message")
    
    @field_validator("timestamp")
    @classmethod
    def validate_iso_timestamp(cls, v: str) -> str:
        """Validate ISO 8601 timestamp format."""
        try:
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("timestamp must be a valid ISO 8601 timestamp")
        return v


class Discussion(BaseModel):
    """Represents a discussion room where agents exchange ideas."""
    
    id: str = Field(..., description="Unique discussion identifier")
    sectorId: str = Field(..., description="Sector this discussion belongs to")
    title: str = Field(..., min_length=1, description="Discussion title")
    status: DiscussionStatus = Field(..., description="Current discussion status")
    agentIds: List[str] = Field(
        default_factory=list,
        description="List of agent IDs participating in this discussion"
    )
    messages: List[Message] = Field(
        default_factory=list,
        description="List of messages in this discussion"
    )
    createdAt: str = Field(..., description="ISO 8601 timestamp of creation")
    updatedAt: str = Field(..., description="ISO 8601 timestamp of last update")
    
    @field_validator("createdAt", "updatedAt")
    @classmethod
    def validate_iso_timestamp(cls, v: str) -> str:
        """Validate ISO 8601 timestamp format."""
        try:
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("Timestamp must be a valid ISO 8601 timestamp")
        return v


class Sector(BaseModel):
    """Represents a market sector with agents, discussions, and price data."""
    
    id: str = Field(..., description="Unique sector identifier (e.g., 'tech')")
    name: str = Field(..., min_length=1, description="Sector name (e.g., 'Technology')")
    symbol: str = Field(..., min_length=1, description="Sector symbol (e.g., 'TECH')")
    createdAt: str = Field(..., description="ISO 8601 timestamp of creation")
    currentPrice: float = Field(..., description="Current sector price", ge=0)
    change: float = Field(..., description="Price change from previous period")
    changePercent: float = Field(..., description="Percentage change from previous period")
    volume: int = Field(..., description="Trading volume", ge=0)
    agents: List[Agent] = Field(
        default_factory=list,
        description="List of agents in this sector"
    )
    discussions: List[Discussion] = Field(
        default_factory=list,
        description="List of discussions in this sector"
    )
    candleData: List[CandlePoint] = Field(
        default_factory=list,
        description="Candle chart data (5-minute increments, 288 points per day)"
    )
    
    @field_validator("createdAt")
    @classmethod
    def validate_iso_timestamp(cls, v: str) -> str:
        """Validate ISO 8601 timestamp format."""
        try:
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("createdAt must be a valid ISO 8601 timestamp")
        return v
    
    @field_validator("candleData")
    @classmethod
    def validate_candle_data_length(cls, v: List[CandlePoint]) -> List[CandlePoint]:
        """Validate candle data doesn't exceed daily limit (288 points = 24 hours * 12 points/hour)."""
        if len(v) > 288:
            raise ValueError("Candle data cannot exceed 288 points per day")
        return v

