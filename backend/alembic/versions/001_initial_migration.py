"""Initial migration: create all tables

Revision ID: 001_initial
Revises: 
Create Date: 2025-01-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create sectors table
    op.create_table(
        'sectors',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('createdAt', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('currentPrice', sa.Float(), nullable=False),
        sa.Column('change', sa.Float(), nullable=False),
        sa.Column('changePercent', sa.Float(), nullable=False),
        sa.Column('volume', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sectors_id'), 'sectors', ['id'], unique=False)
    op.create_index(op.f('ix_sectors_name'), 'sectors', ['name'], unique=False)
    op.create_index(op.f('ix_sectors_symbol'), 'sectors', ['symbol'], unique=True)
    
    # Create agents table
    op.create_table(
        'agents',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('performance', sa.Float(), nullable=False),
        sa.Column('trades', sa.Integer(), nullable=False),
        sa.Column('sectorId', sa.String(), nullable=False),
        sa.Column('personality', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('createdAt', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['sectorId'], ['sectors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_agents_id'), 'agents', ['id'], unique=False)
    op.create_index(op.f('ix_agents_role'), 'agents', ['role'], unique=False)
    op.create_index(op.f('ix_agents_status'), 'agents', ['status'], unique=False)
    op.create_index(op.f('ix_agents_sectorId'), 'agents', ['sectorId'], unique=False)
    
    # Create discussions table
    op.create_table(
        'discussions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('sectorId', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('createdAt', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updatedAt', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['sectorId'], ['sectors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_discussions_id'), 'discussions', ['id'], unique=False)
    op.create_index(op.f('ix_discussions_sectorId'), 'discussions', ['sectorId'], unique=False)
    op.create_index(op.f('ix_discussions_status'), 'discussions', ['status'], unique=False)
    
    # Create discussion_messages table
    op.create_table(
        'discussion_messages',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('discussionId', sa.String(), nullable=False),
        sa.Column('agentId', sa.String(), nullable=True),
        sa.Column('agentName', sa.String(), nullable=False),
        sa.Column('content', sa.String(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['discussionId'], ['discussions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['agentId'], ['agents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_discussion_messages_id'), 'discussion_messages', ['id'], unique=False)
    op.create_index(op.f('ix_discussion_messages_discussionId'), 'discussion_messages', ['discussionId'], unique=False)
    op.create_index(op.f('ix_discussion_messages_agentId'), 'discussion_messages', ['agentId'], unique=False)
    op.create_index(op.f('ix_discussion_messages_timestamp'), 'discussion_messages', ['timestamp'], unique=False)
    
    # Create discussion_agents association table
    op.create_table(
        'discussion_agents',
        sa.Column('discussion_id', sa.String(), nullable=False),
        sa.Column('agent_id', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['discussion_id'], ['discussions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('discussion_id', 'agent_id')
    )
    
    # Create sector_candles table (TimescaleDB-ready)
    op.create_table(
        'sector_candles',
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('sectorId', sa.String(), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('timestamp', 'sectorId')
    )
    op.create_index(op.f('ix_sector_candles_sectorId'), 'sector_candles', ['sectorId'], unique=False)
    op.create_index('idx_sector_candles_sector_timestamp', 'sector_candles', ['sectorId', 'timestamp'], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index('idx_sector_candles_sector_timestamp', table_name='sector_candles')
    op.drop_index(op.f('ix_sector_candles_sectorId'), table_name='sector_candles')
    op.drop_table('sector_candles')
    
    op.drop_table('discussion_agents')
    
    op.drop_index(op.f('ix_discussion_messages_timestamp'), table_name='discussion_messages')
    op.drop_index(op.f('ix_discussion_messages_agentId'), table_name='discussion_messages')
    op.drop_index(op.f('ix_discussion_messages_discussionId'), table_name='discussion_messages')
    op.drop_index(op.f('ix_discussion_messages_id'), table_name='discussion_messages')
    op.drop_table('discussion_messages')
    
    op.drop_index(op.f('ix_discussions_status'), table_name='discussions')
    op.drop_index(op.f('ix_discussions_sectorId'), table_name='discussions')
    op.drop_index(op.f('ix_discussions_id'), table_name='discussions')
    op.drop_table('discussions')
    
    op.drop_index(op.f('ix_agents_sectorId'), table_name='agents')
    op.drop_index(op.f('ix_agents_status'), table_name='agents')
    op.drop_index(op.f('ix_agents_role'), table_name='agents')
    op.drop_index(op.f('ix_agents_id'), table_name='agents')
    op.drop_table('agents')
    
    op.drop_index(op.f('ix_sectors_symbol'), table_name='sectors')
    op.drop_index(op.f('ix_sectors_name'), table_name='sectors')
    op.drop_index(op.f('ix_sectors_id'), table_name='sectors')
    op.drop_table('sectors')
