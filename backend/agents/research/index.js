const NewsResearcher = require('./NewsResearcher');
const SentimentAgent = require('./SentimentAgent');
const DataSourceAgent = require('./DataSourceAgent');

/**
 * Run all research agents in parallel and return combined results
 * @param {string} sectorId - The sector ID to research
 * @param {string} topic - The topic to research
 * @returns {Promise<Object>} Combined results from all research agents
 */
async function runResearchBundle(sectorId, topic) {
  const newsResearcher = new NewsResearcher();
  const sentimentAgent = new SentimentAgent();
  const dataSourceAgent = new DataSourceAgent();

  // Run all research agents in parallel
  const [newsResults, sentimentResults, dataResults] = await Promise.all([
    newsResearcher.research(sectorId, topic),
    sentimentAgent.analyze(sectorId, topic),
    dataSourceAgent.fetch(sectorId, topic)
  ]);

  // Combine results
  return {
    sectorId,
    topic,
    timestamp: new Date().toISOString(),
    results: {
      news: newsResults,
      sentiment: sentimentResults,
      data: dataResults
    },
    summary: {
      articleCount: newsResults.articleCount,
      overallSentiment: sentimentResults.sentiment.overall,
      dataSourceCount: dataResults.sourceCount
    }
  };
}

module.exports = {
  runResearchBundle,
  NewsResearcher,
  SentimentAgent,
  DataSourceAgent
};
