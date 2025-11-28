"""
Discussions API router.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.schemas.domain import DiscussionRead, DiscussionSummary, MessageRead
from app.schemas.responses import ApiResponse
from app.utils.storage import load_discussions, load_sectors
import sys
from pathlib import Path
models_path = Path(__file__).parent.parent.parent / "models"
if str(models_path) not in sys.path:
    sys.path.insert(0, str(models_path))
from enums import DiscussionStatus

router = APIRouter()


@router.get("", response_model=ApiResponse[List[DiscussionSummary]])
async def get_discussions(
    sector_id: Optional[str] = Query(None, alias="sectorId"),
    status: Optional[DiscussionStatus] = Query(None),
):
    """
    Get all discussions, optionally filtered by sector_id and/or status.
    Returns list of summaries with id, title, status, sectorId, sectorSymbol, agentIds, messagesCount, updatedAt.
    """
    try:
        discussions_data = load_discussions()
        sectors_data = load_sectors()
        
        # Build sector lookup
        sector_lookup = {s.get("id"): s for s in sectors_data}
        
        # Filter discussions
        filtered_discussions = discussions_data
        
        if sector_id:
            filtered_discussions = [d for d in filtered_discussions if d.get("sectorId") == sector_id]
        
        if status:
            filtered_discussions = [d for d in filtered_discussions if d.get("status") == status.value]
        
        # Convert to DiscussionSummary format
        summaries = []
        for disc_data in filtered_discussions:
            sector_id_val = disc_data.get("sectorId")
            sector = sector_lookup.get(sector_id_val) if sector_id_val else None
            
            # Generate symbol from sector name if available
            sector_symbol = None
            if sector:
                sector_symbol = sector.get("symbol") or sector.get("name", "")[:4].upper()
            
            status_str = disc_data.get("status", "created")
            try:
                disc_status = DiscussionStatus(status_str)
            except ValueError:
                disc_status = DiscussionStatus.CREATED
            
            messages = disc_data.get("messages", [])
            
            summary = DiscussionSummary(
                id=disc_data.get("id"),
                sectorId=disc_data.get("sectorId", ""),
                sectorSymbol=sector_symbol,
                title=disc_data.get("title", ""),
                status=disc_status,
                agentIds=disc_data.get("agentIds", []),
                messagesCount=len(messages),
                updatedAt=disc_data.get("updatedAt", disc_data.get("createdAt", "")),
            )
            summaries.append(summary)
        
        # Sort by updatedAt descending (newest first)
        summaries.sort(key=lambda x: x.updatedAt, reverse=True)
        
        return ApiResponse(success=True, data=summaries)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{discussion_id}", response_model=ApiResponse[DiscussionRead])
async def get_discussion_by_id(discussion_id: str):
    """
    Get a single discussion by ID with full message log.
    Returns full discussion with messages in chronological order.
    """
    try:
        discussions_data = load_discussions()
        
        # Find discussion
        disc_data = next((d for d in discussions_data if d.get("id") == discussion_id), None)
        if not disc_data:
            raise HTTPException(status_code=404, detail="Discussion not found")
        
        status_str = disc_data.get("status", "created")
        try:
            disc_status = DiscussionStatus(status_str)
        except ValueError:
            disc_status = DiscussionStatus.CREATED
        
        # Convert messages
        messages_data = disc_data.get("messages", [])
        messages_list = []
        
        # Load agents to get agent names
        from app.utils.storage import load_agents
        agents_data = load_agents()
        agent_lookup = {a.get("id"): a for a in agents_data}
        
        for idx, msg_data in enumerate(messages_data):
            agent_id = msg_data.get("agentId", "")
            agent_data = agent_lookup.get(agent_id)
            agent_name = agent_data.get("name") if agent_data else msg_data.get("role", "Unknown")
            
            # Handle different message formats
            message = MessageRead(
                id=msg_data.get("id", f"{discussion_id}-msg-{idx}"),
                discussionId=disc_data.get("id"),
                agentId=agent_id,
                agentName=agent_name,
                content=msg_data.get("content", ""),
                timestamp=msg_data.get("timestamp", msg_data.get("createdAt", "")),
            )
            messages_list.append(message)
        
        # Sort messages by timestamp
        messages_list.sort(key=lambda x: x.timestamp)
        
        discussion = DiscussionRead(
            id=disc_data.get("id"),
            sectorId=disc_data.get("sectorId", ""),
            title=disc_data.get("title", ""),
            status=disc_status,
            agentIds=disc_data.get("agentIds", []),
            messages=messages_list,
            createdAt=disc_data.get("createdAt", ""),
            updatedAt=disc_data.get("updatedAt", disc_data.get("createdAt", "")),
        )
        
        return ApiResponse(success=True, data=discussion)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# INTERNAL ENDPOINTS (for manager agent use only)
# These are commented as internal-only per requirements

@router.post("")
async def create_discussion():
    """
    INTERNAL ENDPOINT - Create a new discussion.
    This endpoint is for internal use by manager agents only.
    Not exposed to end-users.
    """
    raise HTTPException(status_code=501, detail="Not implemented - use manager agent")


@router.post("/{discussion_id}/close")
async def close_discussion(discussion_id: str):
    """
    INTERNAL ENDPOINT - Close a discussion.
    This endpoint is for internal use by manager agents only.
    Not exposed to end-users.
    """
    raise HTTPException(status_code=501, detail="Not implemented - use manager agent")

