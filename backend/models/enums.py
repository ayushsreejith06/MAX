"""
Enum definitions for MAX domain models.
"""

from enum import Enum


class AgentStatus(str, Enum):
    """Agent status enumeration."""
    
    ACTIVE = "active"
    IDLE = "idle"
    PROCESSING = "processing"
    OFFLINE = "offline"


class DiscussionStatus(str, Enum):
    """Discussion status enumeration."""
    
    CREATED = "created"
    ACTIVE = "active"
    CLOSED = "closed"
    ARCHIVED = "archived"

