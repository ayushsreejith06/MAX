"""
Market simulator service for generating synthetic market data.

Generates 5-minute candle data for all sectors, updating sector prices
and publishing realtime events via Redis.
"""

import asyncio
import random
import math
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.core.db import SessionLocal
from app.core.config import settings
from app.models.sector import Sector
from app.models.sector_candle import SectorCandle
from app.realtime.publish import publish_market_update, publish_sector_candle


# Global state for trend tracking per sector
_sector_trends: dict[str, dict] = {}


def _round_to_5_minutes(dt: datetime) -> datetime:
    """Round datetime to the nearest 5-minute interval."""
    minutes = (dt.minute // 5) * 5
    return dt.replace(minute=minutes, second=0, microsecond=0)


def _get_next_5min_timestamp() -> datetime:
    """Get the next 5-minute timestamp bucket."""
    now = datetime.now(timezone.utc)
    rounded = _round_to_5_minutes(now)
    # If we're exactly on a 5-minute boundary, move to next
    if rounded <= now:
        rounded += timedelta(minutes=5)
    return rounded


def _generate_price_change(
    base_price: float,
    sector_id: str,
    trend_bias: Optional[str] = None,
) -> float:
    """
    Generate a new price based on the previous price.
    
    Uses a combination of:
    - Trend bias (up/down/volatile)
    - Random walk
    - Wave-like influence for smoother curves
    
    Args:
        base_price: Previous price to base calculation on
        sector_id: Sector ID for trend tracking
        trend_bias: Optional trend direction ("up", "down", "volatile")
    
    Returns:
        New price value
    """
    global _sector_trends
    
    # Initialize or get sector trend state
    if sector_id not in _sector_trends:
        _sector_trends[sector_id] = {
            "trend": trend_bias or random.choice(["up", "down", "volatile"]),
            "wave_phase": random.uniform(0, 2 * math.pi),
            "momentum": 0.0,
        }
    
    trend_state = _sector_trends[sector_id]
    
    # Determine trend direction
    if trend_state["trend"] == "up":
        trend_direction = 1.0
    elif trend_state["trend"] == "down":
        trend_direction = -1.0
    else:  # volatile
        trend_direction = random.choice([-1.0, 1.0])
    
    # Update wave phase for smooth oscillations
    trend_state["wave_phase"] += 0.1
    if trend_state["wave_phase"] > 2 * math.pi:
        trend_state["wave_phase"] -= 2 * math.pi
    
    # Calculate wave influence (sine wave for smooth curves)
    wave_influence = math.sin(trend_state["wave_phase"]) * 0.3
    
    # Momentum (tendency to continue in current direction)
    momentum_factor = trend_state["momentum"] * 0.2
    
    # Random component
    random_change = random.uniform(-0.5, 0.5)
    
    # Combine all factors
    change_percent = (
        trend_direction * 0.2 +  # Trend bias
        wave_influence +          # Wave smoothing
        momentum_factor +         # Momentum
        random_change * 0.3       # Randomness
    )
    
    # Update momentum (decay and add new direction)
    trend_state["momentum"] = trend_state["momentum"] * 0.7 + change_percent * 0.3
    
    # Occasionally change trend (10% chance)
    if random.random() < 0.1:
        trend_state["trend"] = random.choice(["up", "down", "volatile"])
    
    # Calculate new price
    new_price = base_price * (1 + change_percent / 100.0)
    
    # Ensure price doesn't go negative
    return max(0.01, new_price)


def _get_last_candle(db: Session, sector_id: str) -> Optional[SectorCandle]:
    """Get the most recent candle for a sector."""
    return (
        db.query(SectorCandle)
        .filter(SectorCandle.sectorId == sector_id)
        .order_by(desc(SectorCandle.timestamp))
        .first()
    )


def _get_base_price(db: Session, sector: Sector) -> float:
    """
    Get the base price for generating next candle.
    Uses last candle value if available, otherwise sector's current price.
    """
    last_candle = _get_last_candle(db, sector.id)
    if last_candle:
        return last_candle.value
    return sector.currentPrice if sector.currentPrice > 0 else 100.0


async def _generate_candle_for_sector(sector: Sector, timestamp: datetime) -> None:
    """
    Generate a new candle for a sector and save it to the database.
    
    Args:
        sector: Sector model instance
        timestamp: Timestamp for the new candle
    """
    db = SessionLocal()
    try:
        # Get base price
        base_price = _get_base_price(db, sector)
        
        # Generate new price
        new_price = _generate_price_change(base_price, sector.id)
        
        # Check if candle already exists for this timestamp
        existing = (
            db.query(SectorCandle)
            .filter(
                SectorCandle.sectorId == sector.id,
                SectorCandle.timestamp == timestamp
            )
            .first()
        )
        
        if existing:
            # Update existing candle
            existing.value = new_price
        else:
            # Create new candle
            candle = SectorCandle(
                timestamp=timestamp,
                sectorId=sector.id,
                value=new_price,
            )
            db.add(candle)
        
        # Update sector's current price and metrics
        old_price = sector.currentPrice if sector.currentPrice > 0 else base_price
        change = new_price - old_price
        change_percent = (change / old_price * 100.0) if old_price > 0 else 0.0
        
        sector.currentPrice = new_price
        sector.change = change
        sector.changePercent = change_percent
        # Generate synthetic volume (random between 1000-10000)
        sector.volume = random.randint(1000, 10000)
        
        db.commit()
        
        # Publish Redis events
        await publish_sector_candle(
            sectorId=sector.id,
            candle={
                "timestamp": timestamp.isoformat(),
                "value": new_price,
            }
        )
        
        await publish_market_update(
            sectorId=sector.id,
            indexValue=new_price,
            timestamp=timestamp.isoformat(),
        )
        
        print(f"Generated candle for sector {sector.id} ({sector.name}): {new_price:.2f} at {timestamp}")
        
    except Exception as e:
        db.rollback()
        print(f"Error generating candle for sector {sector.id}: {e}")
        raise
    finally:
        db.close()


async def _update_all_sectors() -> None:
    """Generate new candles for all sectors."""
    db = SessionLocal()
    try:
        sectors = db.query(Sector).all()
        timestamp = _get_next_5min_timestamp()
        
        # Generate candles for all sectors concurrently
        tasks = [_generate_candle_for_sector(sector, timestamp) for sector in sectors]
        await asyncio.gather(*tasks, return_exceptions=True)
        
    finally:
        db.close()


async def _backfill_day_of_data() -> None:
    """
    Backfill a day of data (288 candles) if database is empty.
    Only backfills if no candles exist for any sector.
    """
    db = SessionLocal()
    try:
        # Check if any candles exist
        candle_count = db.query(func.count(SectorCandle.timestamp)).scalar()
        
        if candle_count > 0:
            print("Candles already exist, skipping backfill")
            return
        
        print("No candles found, backfilling 24 hours of data...")
        
        sectors = db.query(Sector).all()
        if not sectors:
            print("No sectors found, skipping backfill")
            return
        
        # Generate 288 candles (24 hours * 12 per hour)
        now = datetime.now(timezone.utc)
        start_time = _round_to_5_minutes(now - timedelta(days=1))
        
        for i in range(288):
            timestamp = start_time + timedelta(minutes=i * 5)
            
            # Generate candles for all sectors
            for sector in sectors:
                try:
                    await _generate_candle_for_sector(sector, timestamp)
                except Exception as e:
                    print(f"Error backfilling candle for sector {sector.id} at {timestamp}: {e}")
        
        print(f"Backfilled {288} candles for {len(sectors)} sectors")
        
    finally:
        db.close()


async def _scheduler_loop() -> None:
    """
    Main scheduler loop that runs every 5 minutes.
    """
    print("Market simulator scheduler started")
    
    # Backfill on startup if needed
    await _backfill_day_of_data()
    
    # Calculate time until next 5-minute boundary
    while True:
        try:
            now = datetime.now(timezone.utc)
            next_run = _get_next_5min_timestamp()
            wait_seconds = (next_run - now).total_seconds()
            
            # Wait until next 5-minute boundary
            if wait_seconds > 0:
                print(f"Market simulator: waiting {wait_seconds:.1f} seconds until {next_run}")
                await asyncio.sleep(wait_seconds)
            
            # Generate candles for all sectors
            print(f"Market simulator: generating candles at {datetime.now(timezone.utc)}")
            await _update_all_sectors()
            
            # Small delay to avoid tight loop if timing is off
            await asyncio.sleep(1)
            
        except Exception as e:
            print(f"Error in market simulator scheduler: {e}")
            # Wait a bit before retrying
            await asyncio.sleep(60)


_simulator_task: Optional[asyncio.Task] = None


async def start_market_simulator() -> None:
    """Start the market simulator background task."""
    global _simulator_task
    
    if not settings.ENABLE_MARKET_SIMULATOR:
        print("Market simulator is disabled (ENABLE_MARKET_SIMULATOR=false)")
        return
    
    if _simulator_task is not None and not _simulator_task.done():
        print("Market simulator is already running")
        return
    
    print("Starting market simulator...")
    _simulator_task = asyncio.create_task(_scheduler_loop())


async def stop_market_simulator() -> None:
    """Stop the market simulator background task."""
    global _simulator_task
    
    if _simulator_task is not None and not _simulator_task.done():
        print("Stopping market simulator...")
        _simulator_task.cancel()
        try:
            await _simulator_task
        except asyncio.CancelledError:
            pass
        _simulator_task = None
        print("Market simulator stopped")

