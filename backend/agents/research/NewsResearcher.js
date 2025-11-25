class NewsResearcher {
  constructor(sectorId) {
    this.sectorId = sectorId;
  }

  async run(topic) {
    // Mock news articles for the given topic
    const mockArticles = [
      {
        headline: `${topic} Shows Strong Market Performance`,
        summary: `Recent developments in ${topic} indicate positive market trends and investor confidence.`,
        source: 'Financial Times'
      },
      {
        headline: `Analysts Predict Growth for ${topic}`,
        summary: `Industry experts forecast continued expansion in the ${topic} sector over the next quarter.`,
        source: 'Bloomberg'
      },
      {
        headline: `${topic} Sector Faces Regulatory Changes`,
        summary: `New regulations may impact the ${topic} industry, with stakeholders monitoring developments closely.`,
        source: 'Reuters'
      }
    ];

    return {
      type: 'news',
      sectorId: this.sectorId,
      topic: topic,
      articles: mockArticles
    };
  }
}

module.exports = NewsResearcher;
