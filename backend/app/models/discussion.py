"""
SQLAlchemy ORM models for Discussion and DiscussionMessage.
"""

from sqlalchemy import Column, String, DateTime, ForeignKey, Table
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from .base import Base


# Association table for many-to-many relationship between discussions and agents
discussion_agents = Table(
    "discussion_agents",
    Base.metadata,
    Column("discussion_id", String, ForeignKey("discussions.id", ondelete="CASCADE"), primary_key=True),
    Column("agent_id", String, ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True),
)


class Discussion(Base):
    """
    Represents a discussion room where agents exchange ideas.
    """
    
    __tablename__ = "discussions"
    
    id = Column(
        String,
        primary_key=True,
        index=True
    )
    sectorId = Column(String, ForeignKey("sectors.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True)  # DiscussionStatus enum as string
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    sector = relationship("Sector", back_populates="discussions")
    messages = relationship("DiscussionMessage", back_populates="discussion", cascade="all, delete-orphan")
    agents = relationship("Agent", secondary=discussion_agents, back_populates="discussions")


class DiscussionMessage(Base):
    """
    Represents a message in a discussion.
    """
    
    __tablename__ = "discussion_messages"
    
    id = Column(
        String,
        primary_key=True,
        index=True
    )
    discussionId = Column(String, ForeignKey("discussions.id", ondelete="CASCADE"), nullable=False, index=True)
    agentId = Column(String, ForeignKey("agents.id", ondelete="SET NULL"), nullable=True, index=True)
    agentName = Column(String, nullable=False)
    content = Column(String, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # Relationships
    discussion = relationship("Discussion", back_populates="messages")
    agent = relationship("Agent")

