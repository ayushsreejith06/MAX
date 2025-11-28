"""
Seed data generation functions for MAX backend.

Replicates the frontend mock data structure:
- 6 sectors (tech, healthcare, finance, energy, consumer, industrial)
- Agents with personality, status, performance, trades
- Discussions with messages and statuses
- Candle data (288 points per day)
"""

import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import List
from sqlalchemy.orm import Session

from app.models.sector import Sector
from app.models.agent import Agent
from app.models.discussion import Discussion, DiscussionMessage
from app.models.sector_candle import SectorCandle
from app.models.base import Base


# Sector definitions matching frontend
SECTORS = [
    {"id": "tech", "name": "Technology", "symbol": "TECH"},
    {"id": "healthcare", "name": "Healthcare", "symbol": "HLTH"},
    {"id": "finance", "name": "Financial", "symbol": "FINC"},
    {"id": "energy", "name": "Energy", "symbol": "ENRG"},
    {"id": "consumer", "name": "Consumer Goods", "symbol": "CSGD"},
    {"id": "industrial", "name": "Industrial", "symbol": "INDU"},
]

# Agent configuration
AGENT_STATUSES = ["active", "idle", "processing"]
RISK_LEVELS = ["Low", "Medium", "High", "Aggressive"]
DECISION_STYLES = ["Analytical", "Intuitive", "Balanced", "Conservative"]
AGENT_ROLES = ["trader", "analyst", "manager", "advisor", "arbitrage", "general"]

# Discussion configuration
DISCUSSION_STATUSES = ["created", "active", "closed", "archived"]
DISCUSSION_TITLES = [
    "Market Outlook Discussion",
    "Sector Analysis Roundtable",
    "Trading Strategy Session",
    "Risk Assessment Meeting",
    "Performance Review",
    "Market Trends Analysis",
    "Investment Opportunities",
    "Sector Performance Review",
]

MESSAGE_TEMPLATES = [
    "I think we should consider the recent market trends in our analysis.",
    "The data suggests a potential shift in sector dynamics.",
    "We need to reassess our risk tolerance given current conditions.",
    "I recommend a more conservative approach based on recent volatility.",
    "The technical indicators point to a bullish trend.",
    "We should diversify our portfolio to mitigate risks.",
    "Market sentiment appears to be shifting towards growth sectors.",
    "I've analyzed the historical data and see some interesting patterns.",
]


def generate_line_data(base_price: float, points: int = 288, trend: str = "neutral") -> List[float]:
    """
    Generate synthetic candle data points.
    
    Args:
        base_price: Starting price
        points: Number of points to generate (default 288 for one day)
        trend: "up", "down", or "neutral"
    
    Returns:
        List of price values
    """
    values = [base_price]
    current = base_price
    
    # Trend multipliers
    trend_multiplier = {
        "up": 1.001,
        "down": 0.999,
        "neutral": 1.0
    }.get(trend, 1.0)
    
    for _ in range(points - 1):
        # Random walk with slight trend
        change = random.uniform(-0.02, 0.02) * current
        current = current * trend_multiplier + change
        values.append(max(current, base_price * 0.5))  # Prevent negative prices
    
    return values


def generate_agent_personality(role: str) -> dict:
    """
    Generate agent personality based on role.
    
    Args:
        role: Agent role
    
    Returns:
        Personality dictionary
    """
    # Role-based personality templates
    templates = {
        "trader": {
            "riskTolerance": random.choice(["Medium", "High", "Aggressive"]),
            "decisionStyle": random.choice(["Analytical", "Intuitive"]),
            "communicationStyle": "direct",
        },
        "analyst": {
            "riskTolerance": random.choice(["Low", "Medium"]),
            "decisionStyle": "Analytical",
            "communicationStyle": "detailed",
        },
        "manager": {
            "riskTolerance": "Medium",
            "decisionStyle": "Balanced",
            "communicationStyle": "authoritative",
        },
        "advisor": {
            "riskTolerance": random.choice(["Low", "Medium"]),
            "decisionStyle": "Conservative",
            "communicationStyle": "persuasive",
        },
        "arbitrage": {
            "riskTolerance": "Low",
            "decisionStyle": "Analytical",
            "communicationStyle": "technical",
        },
        "general": {
            "riskTolerance": random.choice(RISK_LEVELS),
            "decisionStyle": random.choice(DECISION_STYLES),
            "communicationStyle": "neutral",
        },
    }
    
    return templates.get(role, templates["general"])


def seed_sectors(db: Session) -> dict[str, Sector]:
    """
    Seed sectors table with 6 predefined sectors.
    
    Args:
        db: Database session
    
    Returns:
        Dictionary mapping sector IDs to Sector objects
    """
    sectors_dict = {}
    
    for sector_data in SECTORS:
        # Generate random price data
        base_price = random.uniform(100, 1000)
        change = random.uniform(-50, 50)
        change_percent = (change / base_price) * 100
        volume = random.randint(100000, 10000000)
        
        sector = Sector(
            id=sector_data["id"],
            name=sector_data["name"],
            symbol=sector_data["symbol"],
            currentPrice=base_price,
            change=change,
            changePercent=change_percent,
            volume=volume,
            createdAt=datetime.now(timezone.utc),
        )
        db.add(sector)
        sectors_dict[sector_data["id"]] = sector
    
    db.commit()
    return sectors_dict


def seed_agents(db: Session, sectors_dict: dict[str, Sector], agents_per_sector: int = 5) -> dict[str, Agent]:
    """
    Seed agents table with synthetic agents.
    
    Args:
        db: Database session
        sectors_dict: Dictionary of sector IDs to Sector objects
        agents_per_sector: Number of agents per sector
    
    Returns:
        Dictionary mapping agent IDs to Agent objects
    """
    agents_dict = {}
    
    for sector_id, sector in sectors_dict.items():
        for i in range(agents_per_sector):
            agent_id = str(uuid.uuid4())
            role = random.choice(AGENT_ROLES)
            personality = generate_agent_personality(role)
            
            agent = Agent(
                id=agent_id,
                name=f"{role.capitalize()} Agent {i+1}",
                role=role,
                status=random.choice(AGENT_STATUSES),
                performance=random.uniform(-10.0, 15.0),  # Performance percentage
                trades=random.randint(0, 100),
                sectorId=sector_id,
                personality=personality,
                createdAt=datetime.now(timezone.utc) - timedelta(days=random.randint(0, 30)),
            )
            db.add(agent)
            agents_dict[agent_id] = agent
    
    db.commit()
    return agents_dict


def seed_discussions(
    db: Session,
    sectors_dict: dict[str, Sector],
    agents_dict: dict[str, Agent],
    discussions_per_sector: int = 3
) -> dict[str, Discussion]:
    """
    Seed discussions table with synthetic discussions and messages.
    
    Args:
        db: Database session
        sectors_dict: Dictionary of sector IDs to Sector objects
        agents_dict: Dictionary of agent IDs to Agent objects
        discussions_per_sector: Number of discussions per sector
    
    Returns:
        Dictionary mapping discussion IDs to Discussion objects
    """
    discussions_dict = {}
    
    # Get agents grouped by sector
    agents_by_sector = {}
    for agent_id, agent in agents_dict.items():
        if agent.sectorId not in agents_by_sector:
            agents_by_sector[agent.sectorId] = []
        agents_by_sector[agent.sectorId].append(agent)
    
    for sector_id, sector in sectors_dict.items():
        sector_agents = agents_by_sector.get(sector_id, [])
        if not sector_agents:
            continue
        
        for i in range(discussions_per_sector):
            discussion_id = str(uuid.uuid4())
            
            # Random creation time within last 7 days
            days_ago = random.randint(0, 7)
            created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
            updated_at = created_at + timedelta(hours=random.randint(1, 48))
            
            discussion = Discussion(
                id=discussion_id,
                sectorId=sector_id,
                title=random.choice(DISCUSSION_TITLES),
                status=random.choice(DISCUSSION_STATUSES),
                createdAt=created_at,
                updatedAt=updated_at,
            )
            db.add(discussion)
            db.flush()  # Flush to get the ID
            
            # Add 3-8 messages per discussion
            num_messages = random.randint(3, 8)
            selected_agents = random.sample(sector_agents, min(num_messages, len(sector_agents)))
            
            for j, agent in enumerate(selected_agents):
                message_id = str(uuid.uuid4())
                message_time = created_at + timedelta(minutes=random.randint(5, 60 * (j + 1)))
                
                message = DiscussionMessage(
                    id=message_id,
                    discussionId=discussion_id,
                    agentId=agent.id,
                    agentName=agent.name,
                    content=random.choice(MESSAGE_TEMPLATES),
                    timestamp=message_time,
                )
                db.add(message)
            
            # Link agents to discussion
            discussion.agents = selected_agents
            discussions_dict[discussion_id] = discussion
    
    db.commit()
    return discussions_dict


def seed_candles(
    db: Session,
    sectors_dict: dict[str, Sector],
    days: int = 7,
    points_per_day: int = 288
) -> None:
    """
    Seed sector_candles table with synthetic candle data.
    
    Args:
        db: Database session
        sectors_dict: Dictionary of sector IDs to Sector objects
        days: Number of days of data to generate
        points_per_day: Number of data points per day (default 288 = 5-minute intervals)
    """
    for sector_id, sector in sectors_dict.items():
        base_price = sector.currentPrice
        current_time = datetime.now(timezone.utc) - timedelta(days=days)
        
        # Determine trend based on sector change
        if sector.changePercent > 2:
            trend = "up"
        elif sector.changePercent < -2:
            trend = "down"
        else:
            trend = "neutral"
        
        for day in range(days):
            # Generate points for this day
            day_start = current_time + timedelta(days=day)
            prices = generate_line_data(base_price, points_per_day, trend)
            
            # Create candle entries (one per 5 minutes = 288 per day)
            interval_minutes = (24 * 60) / points_per_day
            
            for i, price in enumerate(prices):
                timestamp = day_start + timedelta(minutes=i * interval_minutes)
                
                candle = SectorCandle(
                    timestamp=timestamp,
                    sectorId=sector_id,
                    value=price,
                )
                db.add(candle)
    
    db.commit()


def run_seed(db: Session, force: bool = False) -> None:
    """
    Main seed function that orchestrates all seeding operations.
    
    Args:
        db: Database session
        force: If True, skip idempotency check and seed anyway
    """
    # Idempotency check: if sectors exist, skip seeding
    existing_sectors = db.query(Sector).first()
    if existing_sectors and not force:
        print("Sectors already exist in database. Skipping seed.")
        print("To force re-seeding, use force=True or delete existing data first.")
        return
    
    print("Starting seed process...")
    
    # Seed in order: sectors -> agents -> discussions -> candles
    print("Seeding sectors...")
    sectors_dict = seed_sectors(db)
    print(f"Created {len(sectors_dict)} sectors")
    
    print("Seeding agents...")
    agents_dict = seed_agents(db, sectors_dict)
    print(f"Created {len(agents_dict)} agents")
    
    print("Seeding discussions...")
    discussions_dict = seed_discussions(db, sectors_dict, agents_dict)
    print(f"Created {len(discussions_dict)} discussions")
    
    print("Seeding candles...")
    seed_candles(db, sectors_dict)
    print("Created candle data for all sectors")
    
    print("Seed process completed successfully!")

