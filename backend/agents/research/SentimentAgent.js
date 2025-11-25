class SentimentAgent {
  async run(assetOrSector) {
    // Mock sentiment analysis
    // Generate a random score between -1 and 1
    const score = (Math.random() * 2) - 1; // Range: -1 to 1
    
    // Determine sentiment explanation based on score
    let explanation;
    if (score > 0.5) {
      explanation = `Strong positive sentiment detected for ${assetOrSector}. Market participants show high confidence and optimism.`;
    } else if (score > 0) {
      explanation = `Moderately positive sentiment for ${assetOrSector}. Cautious optimism prevails in the market.`;
    } else if (score > -0.5) {
      explanation = `Moderately negative sentiment for ${assetOrSector}. Some concerns are emerging among investors.`;
    } else {
      explanation = `Strong negative sentiment detected for ${assetOrSector}. Market participants show significant pessimism.`;
    }

    return {
      type: 'sentiment',
      target: assetOrSector,
      score: parseFloat(score.toFixed(3)),
      explanation: explanation
    };
  }
}

module.exports = SentimentAgent;
