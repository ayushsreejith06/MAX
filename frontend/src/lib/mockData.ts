import type { DiscussionSummary, Discussion, Message, Agent } from './types';

/**
 * Mock data for discussions and messages.
 * Used for development and testing when backend is unavailable.
 */

// Mock agents for discussions
export const mockAgents: Agent[] = [
  {
    id: 'agent-1',
    name: 'Alex Trader',
    role: 'Technical Analyst',
    status: 'active',
    performance: 85.5,
    trades: 42,
    sectorId: 'sector-1',
    personality: {
      riskTolerance: 'moderate',
      decisionStyle: 'data-driven',
      communicationStyle: 'analytical',
    },
    createdAt: '2024-01-15T10:00:00Z',
    sectorName: 'Technology',
    sectorSymbol: 'TECH',
  },
  {
    id: 'agent-2',
    name: 'Sarah Investor',
    role: 'Fund Manager',
    status: 'active',
    performance: 92.3,
    trades: 67,
    sectorId: 'sector-1',
    personality: {
      riskTolerance: 'conservative',
      decisionStyle: 'strategic',
      communicationStyle: 'diplomatic',
    },
    createdAt: '2024-01-15T10:00:00Z',
    sectorName: 'Technology',
    sectorSymbol: 'TECH',
  },
  {
    id: 'agent-3',
    name: 'Mike Strategist',
    role: 'Market Strategist',
    status: 'active',
    performance: 78.9,
    trades: 35,
    sectorId: 'sector-1',
    personality: {
      riskTolerance: 'aggressive',
      decisionStyle: 'intuitive',
      communicationStyle: 'direct',
    },
    createdAt: '2024-01-15T10:00:00Z',
    sectorName: 'Technology',
    sectorSymbol: 'TECH',
  },
  {
    id: 'agent-4',
    name: 'Emma Analyst',
    role: 'Research Analyst',
    status: 'active',
    performance: 88.1,
    trades: 51,
    sectorId: 'sector-2',
    personality: {
      riskTolerance: 'moderate',
      decisionStyle: 'analytical',
      communicationStyle: 'detailed',
    },
    createdAt: '2024-01-15T10:00:00Z',
    sectorName: 'Finance',
    sectorSymbol: 'FIN',
  },
];

// Mock messages for discussions
export const mockMessages: Message[] = [
  {
    id: 'msg-1',
    discussionId: 'disc-1',
    agentId: 'agent-1',
    agentName: 'Alex Trader',
    content: 'Looking at the technical indicators, I see strong support at $150. The RSI is oversold, which suggests a potential bounce.',
    timestamp: '2024-01-20T10:00:00Z',
  },
  {
    id: 'msg-2',
    discussionId: 'disc-1',
    agentId: 'agent-2',
    agentName: 'Sarah Investor',
    content: 'I agree with the technical analysis, but we should also consider the broader market sentiment. The Fed meeting next week could impact volatility.',
    timestamp: '2024-01-20T10:05:00Z',
  },
  {
    id: 'msg-3',
    discussionId: 'disc-1',
    agentId: 'agent-3',
    agentName: 'Mike Strategist',
    content: 'From a strategic perspective, I think we\'re seeing a shift in sector rotation. Technology has been outperforming, but I\'m watching for signs of rotation into value stocks.',
    timestamp: '2024-01-20T10:10:00Z',
  },
  {
    id: 'msg-4',
    discussionId: 'disc-1',
    agentId: 'agent-1',
    agentName: 'Alex Trader',
    content: 'Good point, Mike. The volume patterns support that thesis. We\'re seeing increased institutional flow into financials.',
    timestamp: '2024-01-20T10:15:00Z',
  },
  {
    id: 'msg-5',
    discussionId: 'disc-2',
    agentId: 'agent-4',
    agentName: 'Emma Analyst',
    content: 'Based on my research, the earnings season has been mixed. Some sectors are showing resilience while others are struggling with margin compression.',
    timestamp: '2024-01-20T11:00:00Z',
  },
  {
    id: 'msg-6',
    discussionId: 'disc-2',
    agentId: 'agent-2',
    agentName: 'Sarah Investor',
    content: 'The margin compression is concerning, especially in consumer discretionary. I\'m focusing on companies with strong pricing power.',
    timestamp: '2024-01-20T11:05:00Z',
  },
  {
    id: 'msg-7',
    discussionId: 'disc-3',
    agentId: 'agent-1',
    agentName: 'Alex Trader',
    content: 'The market opened strong today, but we\'re seeing some profit-taking in the afternoon session. This is typical after a strong rally.',
    timestamp: '2024-01-20T14:00:00Z',
  },
  {
    id: 'msg-8',
    discussionId: 'disc-3',
    agentId: 'agent-3',
    agentName: 'Mike Strategist',
    content: 'I\'m monitoring the VIX closely. It\'s been elevated, which suggests traders are hedging against potential downside. Could be a sign of caution ahead of key economic data.',
    timestamp: '2024-01-20T14:10:00Z',
  },
];

// Mock discussion summaries for list view
export const mockDiscussions: DiscussionSummary[] = [
  {
    id: 'disc-1',
    sectorId: 'sector-1',
    sectorSymbol: 'TECH',
    title: 'Technology Sector Outlook Q1 2024',
    status: 'active',
    agentIds: ['agent-1', 'agent-2', 'agent-3'],
    messagesCount: 4,
    updatedAt: '2024-01-20T10:15:00Z',
  },
  {
    id: 'disc-2',
    sectorId: 'sector-2',
    sectorSymbol: 'FIN',
    title: 'Earnings Season Analysis',
    status: 'active',
    agentIds: ['agent-2', 'agent-4'],
    messagesCount: 2,
    updatedAt: '2024-01-20T11:05:00Z',
  },
  {
    id: 'disc-3',
    sectorId: 'sector-1',
    sectorSymbol: 'TECH',
    title: 'Market Volatility Discussion',
    status: 'closed',
    agentIds: ['agent-1', 'agent-3'],
    messagesCount: 2,
    updatedAt: '2024-01-20T14:10:00Z',
  },
  {
    id: 'disc-4',
    sectorId: 'sector-1',
    sectorSymbol: 'TECH',
    title: 'AI Investment Opportunities',
    status: 'active',
    agentIds: ['agent-1', 'agent-2', 'agent-3', 'agent-4'],
    messagesCount: 0,
    updatedAt: '2024-01-20T09:00:00Z',
  },
];

// Helper function to get full discussion with messages
export function getMockDiscussion(id: string): Discussion | null {
  const summary = mockDiscussions.find((d) => d.id === id);
  if (!summary) return null;

  const messages = mockMessages
    .filter((m) => m.discussionId === id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    ...summary,
    messages,
    createdAt: '2024-01-20T09:00:00Z',
  };
}

// Helper function to get agents by IDs
export function getMockAgentsByIds(agentIds: string[]): Agent[] {
  return mockAgents.filter((agent) => agentIds.includes(agent.id));
}
