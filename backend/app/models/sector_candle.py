"""
SQLAlchemy ORM model for SectorCandle (TimescaleDB-ready).
"""

from sqlalchemy import Column, String, DateTime, Float, Index

from .base import Base


class SectorCandle(Base):
    """
    Represents a single candle data point for a sector.
    
    Designed to be TimescaleDB-compatible:
    - Composite primary key on (timestamp, sector_id)
    - Index on (sector_id, timestamp) for efficient queries
    - Can be converted to a hypertable with:
      SELECT create_hypertable('sector_candles', 'timestamp');
    """
    
    __tablename__ = "sector_candles"
    
    # Composite primary key for TimescaleDB compatibility
    timestamp = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    sectorId = Column(String, primary_key=True, nullable=False, index=True)
    
    # Candle data
    value = Column(Float, nullable=False)  # Price/index level
    
    # Index for efficient queries by sector and time
    __table_args__ = (
        Index("idx_sector_candles_sector_timestamp", "sectorId", "timestamp"),
    )
