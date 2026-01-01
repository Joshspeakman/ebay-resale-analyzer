/**
 * Price Calculator Service
 * Analyzes eBay data to generate actionable pricing recommendations
 */

/**
 * Calculates suggested selling price based on eBay data
 * @param {Object} ebayData - Data from eBay service
 * @returns {Object} Price recommendations
 */
function calculateSuggestedPrice(ebayData) {
    const { soldCount, activeCount, avgSoldPrice, avgActivePrice, priceRange } = ebayData;
    
    // Weight sold prices more heavily than active listings (70/30 split)
    const soldWeight = 0.7;
    const activeWeight = 0.3;
    
    let basePrice;
    let methodology = [];
    
    if (avgSoldPrice > 0 && avgActivePrice > 0) {
        basePrice = (avgSoldPrice * soldWeight) + (avgActivePrice * activeWeight);
        methodology.push('Weighted average: 70% sold listings, 30% active listings');
    } else if (avgSoldPrice > 0) {
        basePrice = avgSoldPrice;
        methodology.push('Based on sold listings only');
    } else if (avgActivePrice > 0) {
        basePrice = avgActivePrice * 0.9; // Discount active prices by 10%
        methodology.push('Based on active listings (discounted 10%)');
    } else {
        return {
            suggestedPrice: null,
            quickSalePrice: null,
            premiumPrice: null,
            confidence: 'low',
            methodology: ['Insufficient data for price calculation'],
            outlierCount: 0
        };
    }

    // Adjust for market conditions
    const competitionRatio = activeCount > 0 ? soldCount / activeCount : 1;
    let marketAdjustment = 1.0;
    
    if (competitionRatio < 0.3) {
        // High competition, many listings, few sales
        marketAdjustment = 0.92;
        methodology.push('Adjusted down 8% due to high competition');
    } else if (competitionRatio > 2) {
        // Low competition, items selling faster than listed
        marketAdjustment = 1.05;
        methodology.push('Adjusted up 5% due to strong demand');
    }

    const adjustedPrice = basePrice * marketAdjustment;

    // Calculate different price points
    const suggestedPrice = roundToNearestSensible(adjustedPrice);
    const quickSalePrice = roundToNearestSensible(adjustedPrice * 0.85);
    const premiumPrice = roundToNearestSensible(adjustedPrice * 1.15);

    // Determine confidence level
    let confidence = 'medium';
    if (soldCount >= 20 && ebayData.dataSource === 'exact') {
        confidence = 'high';
    } else if (soldCount < 5 || ebayData.dataSource === 'category') {
        confidence = 'low';
    }

    return {
        suggestedPrice,
        quickSalePrice,
        premiumPrice,
        confidence,
        methodology,
        outlierCount: 0, // Would be calculated with full price data
        priceBreakdown: {
            avgSoldContribution: Math.round(avgSoldPrice * soldWeight * 100) / 100,
            avgActiveContribution: Math.round(avgActivePrice * activeWeight * 100) / 100,
            marketAdjustment: marketAdjustment,
            competitionRatio: Math.round(competitionRatio * 100) / 100
        }
    };
}

/**
 * Removes outliers from price array using IQR method
 * @param {number[]} prices - Array of prices
 * @returns {Object} Filtered prices and outlier count
 */
function removeOutliers(prices) {
    if (prices.length < 4) {
        return { filtered: prices, outlierCount: 0 };
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    
    const lowerBound = q1 - (iqr * 1.5);
    const upperBound = q3 + (iqr * 1.5);
    
    const filtered = prices.filter(p => p >= lowerBound && p <= upperBound);
    
    return {
        filtered,
        outlierCount: prices.length - filtered.length
    };
}

/**
 * Rounds price to psychologically sensible price point
 * @param {number} price - Raw price
 * @returns {number} Rounded price
 */
function roundToNearestSensible(price) {
    if (price < 10) {
        return Math.round(price * 2) / 2; // Round to nearest 0.50
    } else if (price < 50) {
        return Math.round(price); // Round to nearest dollar
    } else if (price < 100) {
        return Math.round(price / 5) * 5; // Round to nearest 5
    } else if (price < 500) {
        return Math.round(price / 10) * 10; // Round to nearest 10
    } else {
        return Math.round(price / 25) * 25; // Round to nearest 25
    }
}

/**
 * Analyzes price distribution for insights
 * @param {number[]} prices - Array of sold prices
 * @returns {Object} Distribution analysis
 */
function analyzePriceDistribution(prices) {
    if (prices.length === 0) {
        return { median: 0, mode: 0, stdDev: 0 };
    }

    const sorted = [...prices].sort((a, b) => a - b);
    
    // Median
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    
    // Mode (most common price, rounded)
    const roundedPrices = prices.map(p => Math.round(p));
    const frequency = {};
    roundedPrices.forEach(p => {
        frequency[p] = (frequency[p] || 0) + 1;
    });
    const mode = Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
    
    // Standard deviation
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const squaredDiffs = prices.map(p => Math.pow(p - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / prices.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    return {
        median: Math.round(median * 100) / 100,
        mode: parseFloat(mode),
        stdDev: Math.round(stdDev * 100) / 100,
        mean: Math.round(mean * 100) / 100
    };
}

module.exports = {
    calculateSuggestedPrice,
    removeOutliers,
    roundToNearestSensible,
    analyzePriceDistribution
};
