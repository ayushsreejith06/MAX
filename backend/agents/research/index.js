const NewsResearcher = require('./NewsResearcher');
const SentimentAgent = require('./SentimentAgent');
const DataSourceAgent = require('./DataSourceAgent');

async function runResearchBundle(sectorId, topic) {
  const [news, sentiment, dataSource] = await Promise.all([
    NewsResearcher.research(sectorId, topic),
    SentimentAgent.analyze(sectorId, topic),
    DataSourceAgent.fetch(sectorId, topic)
  ]);

  return {
    news,
    sentiment,
    dataSource
  };
}

module.exports = { runResearchBundle };
