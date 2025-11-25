const NewsResearcher = require('./NewsResearcher');
const SentimentAgent = require('./SentimentAgent');
const DataSourceAgent = require('./DataSourceAgent');

/**
 * Runs all research agents in parallel and returns combined results
 * @param {string} sectorId - The sector ID to research
 * @param {string} topic - The topic to research
 * @returns {Promise<Object>} Combined research results from all agents
 */
async function runResearchBundle(sectorId, topic) {
  // Initialize agents
  const newsResearcher = new NewsResearcher(sectorId);
  const sentimentAgent = new SentimentAgent();
  const dataSourceAgent = new DataSourceAgent();

  // Run all research agents in parallel
  const [newsResult, sentimentResult, dataResult] = await Promise.all([
    newsResearcher.run(topic),
    sentimentAgent.run(topic),
    dataSourceAgent.run(topic)
  ]);

  // Combine results
  return {
    sectorId: sectorId,
    topic: topic,
    timestamp: new Date().toISOString(),
    results: {
      news: newsResult,
      sentiment: sentimentResult,
      data: dataResult
    }
  };
}

module.exports = {
  runResearchBundle,
  NewsResearcher,
  SentimentAgent,
  DataSourceAgent
};
