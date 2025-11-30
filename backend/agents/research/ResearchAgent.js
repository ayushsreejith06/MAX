/**
 * ResearchAgent - Unified research agent that orchestrates news, sentiment, and data source analysis
 * 
 * Extends BaseAgent to inherit memory and reasoning capabilities.
 * Produces structured research signals for ManagerAgent consumption.
 */

const BaseAgent = require('../base/BaseAgent');
const NewsResearcher = require('./NewsResearcher');
const SentimentAgent = require('./SentimentAgent');
const DataSourceAgent = require('./DataSourceAgent');

class ResearchAgent extends BaseAgent {
  /**
   * Creates a new ResearchAgent instance
   * @param {Object} config - Configuration object
   * @param {string} config.id - Agent ID
   * @param {string} config.name - Agent name
   * @param {string} config.sectorId - Sector ID this agent researches
   * @param {Object} config.personality - Personality configuration
   * @param {Object} config.performance - Performance metrics
   */
  constructor({ id, name, sectorId, personality = {}, performance = {} }) {
    if (!id) throw new Error('Research agent ID is required');
    if (!name) throw new Error('Research agent name is required');

    // Initialize BaseAgent
    super({
      id,
      name,
      role: 'research',
      personality: {
        riskTolerance: 'low',
        decisionStyle: 'studious',
        ...personality
      },
      performance
    });

    this.sectorId = sectorId;
    
    // Initialize research components
    this.newsResearcher = new NewsResearcher(sectorId);
    this.sentimentAgent = new SentimentAgent();
    this.dataSourceAgent = new DataSourceAgent();
  }

  /**
   * Collect news articles for a topic
   * @param {string} topic - Topic to research
   * @returns {Promise<Array>} Array of news articles
   */
  async collectNews(topic) {
    try {
      const articles = await this.newsResearcher.collectNews(topic);
      this.updateMemory({
        timestamp: Date.now(),
        type: 'research',
        reasoning: `Collected ${articles.length} news articles for ${topic}`,
        data: { topic, articleCount: articles.length }
      });
      return articles;
    } catch (error) {
      console.error(`[ResearchAgent ${this.id}] Error collecting news:`, error);
      this.updateMemory({
        timestamp: Date.now(),
        type: 'error',
        reasoning: `Failed to collect news: ${error.message}`,
        data: { topic, error: error.message }
      });
      return [];
    }
  }

  /**
   * Perform sentiment analysis on news articles
   * @param {Array|string} input - News articles or text to analyze
   * @returns {Promise<Object>} Sentiment analysis result
   */
  async performSentimentAnalysis(input) {
    try {
      const result = await this.sentimentAgent.performSentimentAnalysis(input);
      this.updateMemory({
        timestamp: Date.now(),
        type: 'research',
        reasoning: `Sentiment analysis completed: ${result.explanation}`,
        data: { sentimentScore: result.score, magnitude: result.magnitude }
      });
      return result;
    } catch (error) {
      console.error(`[ResearchAgent ${this.id}] Error performing sentiment analysis:`, error);
      this.updateMemory({
        timestamp: Date.now(),
        type: 'error',
        reasoning: `Failed sentiment analysis: ${error.message}`,
        data: { error: error.message }
      });
      return { score: 0, explanation: 'Sentiment analysis failed', magnitude: 0 };
    }
  }

  /**
   * Fetch data sources (price history, metrics, etc.)
   * @param {string} tickerOrSymbol - Ticker symbol or identifier
   * @returns {Promise<Object>} Data source metrics and history
   */
  async fetchDataSources(tickerOrSymbol) {
    try {
      const data = await this.dataSourceAgent.fetchDataSources(tickerOrSymbol);
      this.updateMemory({
        timestamp: Date.now(),
        type: 'research',
        reasoning: `Fetched data sources for ${tickerOrSymbol}`,
        data: { 
          ticker: tickerOrSymbol, 
          currentPrice: data.currentPrice,
          dataPoints: data.metrics.dataPoints 
        }
      });
      return data;
    } catch (error) {
      console.error(`[ResearchAgent ${this.id}] Error fetching data sources:`, error);
      this.updateMemory({
        timestamp: Date.now(),
        type: 'error',
        reasoning: `Failed to fetch data sources: ${error.message}`,
        data: { ticker: tickerOrSymbol, error: error.message }
      });
      return null;
    }
  }

  /**
   * Produce a research signal based on all research components
   * @param {string} topic - Topic to research
   * @returns {Promise<Object>} Research signal with action, confidence, rationale, and metadata
   */
  async produceResearchSignal(topic) {
    const startTime = Date.now();
    
    try {
      // Step 1: Collect news
      const newsArticles = await this.collectNews(topic);
      
      // Step 2: Perform sentiment analysis on news
      const sentimentResult = await this.performSentimentAnalysis(newsArticles);
      
      // Step 3: Fetch data sources
      const dataSources = await this.fetchDataSources(topic);
      
      // Step 4: Synthesize research into a signal
      const signal = this.synthesizeSignal({
        topic,
        newsArticles,
        sentimentResult,
        dataSources
      });

      // Store the research signal in memory
      this.updateMemory({
        timestamp: Date.now(),
        type: 'research',
        reasoning: `Produced research signal: ${signal.action} (confidence: ${signal.confidence})`,
        data: {
          signal,
          researchDuration: Date.now() - startTime
        }
      });

      return signal;
    } catch (error) {
      console.error(`[ResearchAgent ${this.id}] Error producing research signal:`, error);
      this.updateMemory({
        timestamp: Date.now(),
        type: 'error',
        reasoning: `Failed to produce research signal: ${error.message}`,
        data: { topic, error: error.message }
      });
      
      // Return a default HOLD signal on error
      return {
        type: 'research',
        action: 'HOLD',
        confidence: 0,
        rationale: `Research failed: ${error.message}`,
        metadata: {
          sentimentScore: 0,
          volatility: 0,
          dataPoints: 0,
          error: true
        }
      };
    }
  }

  /**
   * Synthesize research data into a trading signal
   * @param {Object} researchData - Combined research data
   * @returns {Object} Research signal
   */
  synthesizeSignal({ topic, newsArticles, sentimentResult, dataSources }) {
    // Extract key metrics
    const sentimentScore = sentimentResult.score || 0;
    const sentimentMagnitude = sentimentResult.magnitude || 0;
    const volatility = dataSources?.metrics?.volatility || 0;
    const priceChangePercent = dataSources?.metrics?.priceChangePercent || 0;
    const dataPoints = dataSources?.metrics?.dataPoints || 0;
    const newsCount = newsArticles?.length || 0;

    // Determine action based on research
    let action = 'HOLD';
    let confidence = 0;
    let rationale = '';

    // Sentiment-based decision (weight: 40%)
    const sentimentWeight = 0.4;
    let sentimentContribution = 0;
    if (sentimentScore > 0.3) {
      sentimentContribution = sentimentScore * sentimentWeight;
      action = 'BUY';
    } else if (sentimentScore < -0.3) {
      sentimentContribution = Math.abs(sentimentScore) * sentimentWeight;
      action = 'SELL';
    }

    // Price trend-based decision (weight: 30%)
    const priceWeight = 0.3;
    let priceContribution = 0;
    if (priceChangePercent > 2) {
      priceContribution = Math.min(priceChangePercent / 10, 1) * priceWeight;
      if (action === 'HOLD') action = 'BUY';
    } else if (priceChangePercent < -2) {
      priceContribution = Math.min(Math.abs(priceChangePercent) / 10, 1) * priceWeight;
      if (action === 'HOLD') action = 'SELL';
    }

    // Volatility adjustment (weight: 20%)
    const volatilityWeight = 0.2;
    const volatilityPenalty = Math.min(volatility * 2, 1) * volatilityWeight;
    
    // Data quality (weight: 10%)
    const dataQualityWeight = 0.1;
    const dataQuality = Math.min((newsCount / 3) * (dataPoints / 30), 1) * dataQualityWeight;

    // Calculate confidence
    confidence = Math.min(
      sentimentContribution + priceContribution + dataQuality - volatilityPenalty,
      1
    );
    confidence = Math.max(confidence, 0); // Ensure non-negative

    // Build rationale
    const parts = [];
    if (sentimentScore !== 0) {
      parts.push(`Sentiment: ${sentimentResult.explanation}`);
    }
    if (priceChangePercent !== 0) {
      parts.push(`Price trend: ${priceChangePercent > 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%`);
    }
    if (volatility > 0) {
      parts.push(`Volatility: ${(volatility * 100).toFixed(1)}%`);
    }
    parts.push(`Data points: ${newsCount} news articles, ${dataPoints} price points`);
    
    rationale = parts.join('. ') + '.';

    return {
      type: 'research',
      action: action,
      confidence: parseFloat(confidence.toFixed(3)),
      rationale: rationale,
      metadata: {
        sentimentScore: parseFloat(sentimentScore.toFixed(3)),
        sentimentMagnitude: parseFloat(sentimentMagnitude.toFixed(3)),
        volatility: parseFloat(volatility.toFixed(3)),
        priceChangePercent: parseFloat(priceChangePercent.toFixed(2)),
        dataPoints: dataPoints,
        newsCount: newsCount,
        currentPrice: dataSources?.currentPrice || null
      }
    };
  }

  /**
   * Main research method - produces a signal for ManagerAgent
   * @param {string} topic - Topic to research (defaults to sector name)
   * @returns {Promise<Object>} Research signal
   */
  async research(topic = null) {
    const researchTopic = topic || this.sectorId || 'market';
    return await this.produceResearchSignal(researchTopic);
  }

  /**
   * Get a signal in the format expected by ManagerAgent
   * @param {string} topic - Optional topic to research
   * @returns {Promise<Object>} Signal object with action, confidence, agentId, etc.
   */
  async getSignal(topic = null) {
    const researchSignal = await this.research(topic);
    
    // Convert to ManagerAgent signal format
    return {
      action: researchSignal.action,
      confidence: researchSignal.confidence,
      agentId: this.id,
      type: 'research',
      rationale: researchSignal.rationale,
      metadata: researchSignal.metadata
    };
  }
}

module.exports = ResearchAgent;

