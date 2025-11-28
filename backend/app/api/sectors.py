"""
Sectors API router.
"""
from typing import List
from fastapi import APIRouter, HTTPException
from app.schemas.domain import SectorRead, SectorSummary
from app.schemas.responses import ApiResponse
from app.utils.storage import load_sectors, load_agents, load_discussions

router = APIRouter()


@router.get("", response_model=ApiResponse[List[SectorSummary]])
async def get_sectors():
    """
    Get all sectors with summary information.
    Returns sectors without nested heavy data (messages, full agent lists).
    """
    try:
        sectors_data = load_sectors()
        agents_data = load_agents()
        discussions_data = load_discussions()
        
        # Build sector summaries with counts
        sector_summaries = []
        for sector in sectors_data:
            sector_id = sector.get("id")
            
            # Count agents
            sector_agents = [a for a in agents_data if a.get("sectorId") == sector_id]
            agents_count = len(sector_agents)
            active_agents_count = len([a for a in sector_agents if a.get("status") == "active"])
            
            # Count discussions
            sector_discussions = [d for d in discussions_data if d.get("sectorId") == sector_id]
            discussions_count = len(sector_discussions)
            
            # Generate symbol from name (first 4 chars uppercase)
            symbol = sector.get("symbol") or sector.get("name", "")[:4].upper()
            
            summary = SectorSummary(
                id=sector.get("id"),
                name=sector.get("name"),
                symbol=symbol,
                createdAt=sector.get("createdAt", ""),
                currentPrice=sector.get("currentPrice", 0.0),
                change=sector.get("change", 0.0),
                changePercent=sector.get("changePercent", 0.0),
                volume=sector.get("volume", 0),
                agentsCount=agents_count,
                activeAgentsCount=active_agents_count,
                discussionsCount=discussions_count,
            )
            sector_summaries.append(summary)
        
        return ApiResponse(success=True, data=sector_summaries)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sector_id}", response_model=ApiResponse[SectorRead])
async def get_sector_by_id(sector_id: str):
    """
    Get a single sector by ID with full details including agents, discussions, and candle data.
    """
    try:
        sectors_data = load_sectors()
        agents_data = load_agents()
        discussions_data = load_discussions()
        
        # Find sector
        sector = next((s for s in sectors_data if s.get("id") == sector_id), None)
        if not sector:
            raise HTTPException(status_code=404, detail="Sector not found")
        
        # Get sector agents
        sector_agents = [a for a in agents_data if a.get("sectorId") == sector_id]
        
        # Get sector discussions (without full messages for now, just summaries)
        sector_discussions = [d for d in discussions_data if d.get("sectorId") == sector_id]
        
        # Generate symbol from name if not present
        symbol = sector.get("symbol") or sector.get("name", "")[:4].upper()
        
        # Convert agents to AgentRead format
        from app.schemas.domain import AgentRead
        import sys
        from pathlib import Path
        models_path = Path(__file__).parent.parent.parent / "models"
        if str(models_path) not in sys.path:
            sys.path.insert(0, str(models_path))
        from schemas import AgentPersonality
        from enums import AgentStatus
        
        agents_list = []
        for agent_data in sector_agents:
            personality_data = agent_data.get("personality", {})
            personality = AgentPersonality(
                riskTolerance=personality_data.get("riskTolerance", "moderate"),
                decisionStyle=personality_data.get("decisionStyle", "balanced"),
            )
            
            # Map status string to enum
            status_str = agent_data.get("status", "idle")
            try:
                status = AgentStatus(status_str)
            except ValueError:
                status = AgentStatus.IDLE
            
            agent = AgentRead(
                id=agent_data.get("id"),
                name=agent_data.get("name", agent_data.get("role", "Unknown")),
                role=agent_data.get("role", "general"),
                status=status,
                performance=agent_data.get("performance", 0.0),
                trades=agent_data.get("trades", 0),
                sectorId=agent_data.get("sectorId", sector_id),
                personality=personality,
                createdAt=agent_data.get("createdAt", ""),
                sectorName=sector.get("name"),
                sectorSymbol=symbol,
            )
            agents_list.append(agent)
        
        # Convert discussions to Discussion format (simplified, without messages)
        from app.schemas.domain import DiscussionRead
        import sys
        from pathlib import Path
        models_path = Path(__file__).parent.parent.parent / "models"
        if str(models_path) not in sys.path:
            sys.path.insert(0, str(models_path))
        from enums import DiscussionStatus
        
        discussions_list = []
        for disc_data in sector_discussions:
            status_str = disc_data.get("status", "created")
            try:
                status = DiscussionStatus(status_str)
            except ValueError:
                status = DiscussionStatus.CREATED
            
            # Convert messages if present
            messages_data = disc_data.get("messages", [])
            from app.schemas.domain import MessageRead
            
            # Build agent lookup for names
            agent_lookup = {a.get("id"): a for a in agents_data}
            
            messages_list = []
            for idx, msg_data in enumerate(messages_data):
                agent_id = msg_data.get("agentId", "")
                agent_data = agent_lookup.get(agent_id)
                agent_name = agent_data.get("name") if agent_data else msg_data.get("role", "Unknown")
                
                # Handle different message formats
                message = MessageRead(
                    id=msg_data.get("id", f"{disc_data.get('id')}-msg-{idx}"),
                    discussionId=disc_data.get("id"),
                    agentId=agent_id,
                    agentName=agent_name,
                    content=msg_data.get("content", ""),
                    timestamp=msg_data.get("timestamp", msg_data.get("createdAt", "")),
                )
                messages_list.append(message)
            
            discussion = DiscussionRead(
                id=disc_data.get("id"),
                sectorId=disc_data.get("sectorId"),
                title=disc_data.get("title", ""),
                status=status,
                agentIds=disc_data.get("agentIds", []),
                messages=messages_list,
                createdAt=disc_data.get("createdAt", ""),
                updatedAt=disc_data.get("updatedAt", ""),
            )
            discussions_list.append(discussion)
        
        # Generate candle data (mock for now - 288 points, 5-minute increments)
        candle_data = sector.get("candleData", [])
        if not candle_data:
            # Generate mock candle data if not present
            import sys
            from pathlib import Path
            models_path = Path(__file__).parent.parent.parent / "models"
            if str(models_path) not in sys.path:
                sys.path.insert(0, str(models_path))
            from schemas import CandlePoint
            import random
            base_price = sector.get("currentPrice", 100.0)
            candle_data = []
            for i in range(288):  # 24 hours * 12 points/hour
                hour = i // 12
                minute = (i % 12) * 5
                time_str = f"{hour:02d}:{minute:02d}"
                # Simple random walk
                base_price += random.uniform(-0.5, 0.5)
                candle_data.append(CandlePoint(time=time_str, value=max(0, base_price)))
        
        # Build full sector
        sector_read = SectorRead(
            id=sector.get("id"),
            name=sector.get("name"),
            symbol=symbol,
            createdAt=sector.get("createdAt", ""),
            currentPrice=sector.get("currentPrice", 0.0),
            change=sector.get("change", 0.0),
            changePercent=sector.get("changePercent", 0.0),
            volume=sector.get("volume", 0),
            agents=agents_list,
            discussions=discussions_list,
            candleData=candle_data,
        )
        
        return ApiResponse(success=True, data=sector_read)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

