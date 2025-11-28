"""
Agents API router.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.schemas.domain import AgentRead
from app.schemas.responses import ApiResponse
from app.utils.storage import load_agents, load_sectors
import sys
from pathlib import Path
models_path = Path(__file__).parent.parent.parent / "models"
if str(models_path) not in sys.path:
    sys.path.insert(0, str(models_path))
from enums import AgentStatus
from schemas import AgentPersonality

router = APIRouter()


@router.get("", response_model=ApiResponse[List[AgentRead]])
async def get_agents(
    sector_id: Optional[str] = Query(None, alias="sectorId"),
    status: Optional[AgentStatus] = Query(None),
):
    """
    Get all agents, optionally filtered by sector_id and/or status.
    Returns flat list with sector metadata (sectorName, sectorSymbol).
    """
    try:
        agents_data = load_agents()
        sectors_data = load_sectors()
        
        # Build sector lookup
        sector_lookup = {s.get("id"): s for s in sectors_data}
        
        # Filter agents
        filtered_agents = agents_data
        
        if sector_id:
            filtered_agents = [a for a in filtered_agents if a.get("sectorId") == sector_id]
        
        if status:
            filtered_agents = [a for a in filtered_agents if a.get("status") == status.value]
        
        # Convert to AgentRead format
        agents_list = []
        for agent_data in filtered_agents:
            agent_sector_id = agent_data.get("sectorId")
            sector = sector_lookup.get(agent_sector_id) if agent_sector_id else None
            
            # Generate symbol from sector name if available
            sector_symbol = None
            if sector:
                sector_symbol = sector.get("symbol") or sector.get("name", "")[:4].upper()
            
            personality_data = agent_data.get("personality", {})
            personality = AgentPersonality(
                riskTolerance=personality_data.get("riskTolerance", "moderate"),
                decisionStyle=personality_data.get("decisionStyle", "balanced"),
            )
            
            # Map status string to enum
            status_str = agent_data.get("status", "idle")
            try:
                agent_status = AgentStatus(status_str)
            except ValueError:
                agent_status = AgentStatus.IDLE
            
            agent = AgentRead(
                id=agent_data.get("id"),
                name=agent_data.get("name", agent_data.get("role", "Unknown")),
                role=agent_data.get("role", "general"),
                status=agent_status,
                performance=agent_data.get("performance", 0.0),
                trades=agent_data.get("trades", 0),
                sectorId=agent_data.get("sectorId", ""),
                personality=personality,
                createdAt=agent_data.get("createdAt", ""),
                sectorName=sector.get("name") if sector else None,
                sectorSymbol=sector_symbol,
            )
            agents_list.append(agent)
        
        return ApiResponse(success=True, data=agents_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
