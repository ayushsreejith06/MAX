"""
SQLAlchemy ORM model for Agent.
"""

from sqlalchemy import Column, String, DateTime, Float, Integer, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from .base import Base


class Agent(Base):
    """
    Represents an AI agent that can participate in discussions and trading.
    """
    
    __tablename__ = "agents"
    
    id = Column(
        String,
        primary_key=True,
        index=True
    )
    name = Column(String, nullable=False)
    role = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, index=True)  # AgentStatus enum as string
    performance = Column(Float, nullable=False, default=0.0)
    trades = Column(Integer, nullable=False, default=0)
    sectorId = Column(String, ForeignKey("sectors.id", ondelete="CASCADE"), nullable=False, index=True)
    personality = Column(JSON, nullable=False)  # JSON field for personality traits
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    sector = relationship("Sector", back_populates="agents")
    discussions = relationship("Discussion", secondary="discussion_agents", back_populates="agents")
