"""
SQLAlchemy ORM model for Sector.
"""

from sqlalchemy import Column, String, DateTime, Float, Integer
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from .base import Base


class Sector(Base):
    """
    Represents a market sector with agents, discussions, and price data.
    """
    
    __tablename__ = "sectors"
    
    id = Column(
        String,
        primary_key=True,
        index=True
    )
    name = Column(String, nullable=False, index=True)
    symbol = Column(String, nullable=False, unique=True, index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    currentPrice = Column(Float, nullable=False, default=0.0)
    change = Column(Float, nullable=False, default=0.0)
    changePercent = Column(Float, nullable=False, default=0.0)
    volume = Column(Integer, nullable=False, default=0)
    
    # Relationships
    agents = relationship("Agent", back_populates="sector", cascade="all, delete-orphan")
    discussions = relationship("Discussion", back_populates="sector", cascade="all, delete-orphan")
