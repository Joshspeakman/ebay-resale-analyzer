/**
 * eBay Data Service - Hybrid Approach
 * Uses Claude web search for real-time eBay data (when API key available)
 * Falls back to estimated pricing based on market data
 */

const Anthropic = require('@anthropic-ai/sdk');

// Check if Claude API key is available
const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY;
let anthropic = null;

if (hasClaudeKey) {
    anthropic = new Anthropic();
    console.log('✅ Claude API configured - will use real-time eBay search');
} else {
    console.log('ℹ️  No ANTHROPIC_API_KEY - using estimated pricing');
}

// Fallback price estimates by category
const CATEGORY_ESTIMATES = {
    'Gaming Consoles': {
        'Nintendo NES': { low: 40, high: 120, avg: 65, sold: 80 },
        'Nintendo SNES': { low: 60, high: 150, avg: 90, sold: 70 },
        'Nintendo 64': { low: 50, high: 130, avg: 75, sold: 65 },
        'Nintendo GameCube': { low: 80, high: 200, avg: 120, sold: 55 },
        'Nintendo Wii': { low: 30, high: 80, avg: 50, sold: 90 },
        'Sony PlayStation': { low: 30, high: 80, avg: 45, sold: 60 },
        'Sony PlayStation 2': { low: 40, high: 100, avg: 60, sold: 85 },
        'Sony PlayStation 3': { low: 60, high: 150, avg: 90, sold: 70 },
        'Sony PlayStation 4': { low: 150, high: 300, avg: 220, sold: 100 },
        'Sony PlayStation 5': { low: 350, high: 550, avg: 450, sold: 120 },
        'Microsoft Xbox': { low: 40, high: 100, avg: 60, sold: 45 },
        'Microsoft Xbox 360': { low: 50, high: 120, avg: 75, sold: 80 },
        'Microsoft Xbox One': { low: 120, high: 250, avg: 180, sold: 90 },
        'Sega Genesis': { low: 30, high: 80, avg: 50, sold: 55 },
        'Sega Dreamcast': { low: 60, high: 150, avg: 90, sold: 40 },
        'default': { low: 50, high: 150, avg: 80, sold: 50 }
    },
    'Electronics': {
        'iPhone': { low: 150, high: 800, avg: 400, sold: 200 },
        'Samsung Galaxy': { low: 100, high: 600, avg: 300, sold: 150 },
        'iPad': { low: 150, high: 700, avg: 350, sold: 180 },
        'MacBook': { low: 300, high: 1500, avg: 700, sold: 100 },
        'AirPods': { low: 50, high: 200, avg: 120, sold: 250 },
        'default': { low: 20, high: 200, avg: 80, sold: 60 }
    },
    'Clothing': {
        'Nike': { low: 20, high: 150, avg: 60, sold: 120 },
        'Adidas': { low: 15, high: 120, avg: 50, sold: 100 },
        'Supreme': { low: 50, high: 500, avg: 150, sold: 80 },
        'default': { low: 10, high: 100, avg: 30, sold: 80 }
    },
    'Shoes': {
        'Nike': { low: 40, high: 300, avg: 100, sold: 150 },
        'Adidas': { low: 30, high: 200, avg: 80, sold: 130 },
        'Converse': { low: 25, high: 120, avg: 55, sold: 100 },
        'Converse Gorillaz': { low: 150, high: 400, avg: 275, sold: 15 },
        'Jordan': { low: 100, high: 500, avg: 200, sold: 200 },
        'Yeezy': { low: 150, high: 600, avg: 300, sold: 180 },
        'Travis Scott': { low: 200, high: 800, avg: 400, sold: 50 },
        'Off-White': { low: 300, high: 1500, avg: 600, sold: 40 },
        'default': { low: 25, high: 150, avg: 60, sold: 90 }
    },
    'Footwear': {
        'Nike': { low: 40, high: 300, avg: 100, sold: 150 },
        'Converse': { low: 25, high: 120, avg: 55, sold: 100 },
        'default': { low: 25, high: 150, avg: 60, sold: 90 }
    },
    'Collectibles': {
        'Pokemon': { low: 5, high: 500, avg: 50, sold: 200 },
        'Funko': { low: 10, high: 100, avg: 25, sold: 180 },
        'default': { low: 20, high: 500, avg: 100, sold: 60 }
    },
    'default': {
        'default': { low: 15, high: 150, avg: 50, sold: 50 }
    }
};

/**
 * Extract JSON from Claude's response text
 */
function extractJSON(text) {
    if (!text) return null;
    
    try {
        return JSON.parse(text);
    } catch (e) {
        // Try to find JSON in markdown code blocks or text
        const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e2) {
                return null;
            }
        }
    }
    return null;
}

/**
 * Get text content from Claude API response
 */
function getResponseText(data) {
    if (!data || !data.content) return '';
    return data.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
}

/**
 * Condition search terms to append to eBay query
 */
const CONDITION_TERMS = {
    excellent: 'like new',
    good: '',  // Default, no extra terms
    fair: 'used',
    poor: 'for parts'
};

/**
 * Search eBay using Claude's web search capability - COMBINED query for cost efficiency
 */
async function searchEbayWithClaude(searchQuery) {
    if (!anthropic) return null;
    
    const prompt = `Search eBay for "${searchQuery}". Find BOTH sold/completed listings AND current active listings.

Return this JSON with data for both:
{"sold":{"count":50,"low":29.99,"high":89.99,"avg":54.99},"active":{"count":100,"low":24.99,"high":99.99,"avg":49.99}}

Use null for unknown values. JSON only, no other text.`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 300,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{ role: 'user', content: prompt }]
        });

        const text = getResponseText(response);
        const data = extractJSON(text);
        
        if (data) {
            console.log('Claude combined search result:', data);
            return data;
        }
        
        return null;
    } catch (error) {
        console.error('Claude search error:', error.message);
        return null;
    }
}

/**
 * Get estimated pricing based on item category
 */
function getEstimatedPricing(itemIdentification) {
    const category = itemIdentification.category || 'default';
    const subcategory = itemIdentification.subcategory || '';
    const brand = itemIdentification.brand || '';
    const itemName = itemIdentification.itemName || '';
    const specialAttributes = itemIdentification.specialAttributes || [];
    
    let categoryData = CATEGORY_ESTIMATES[category] || CATEGORY_ESTIMATES['default'];
    
    // Check for gaming consoles
    if (subcategory.toLowerCase().includes('gaming') || 
        subcategory.toLowerCase().includes('console') ||
        itemName.toLowerCase().includes('nintendo') ||
        itemName.toLowerCase().includes('playstation') ||
        itemName.toLowerCase().includes('xbox')) {
        categoryData = CATEGORY_ESTIMATES['Gaming Consoles'];
    }
    
    // Check for shoes/footwear
    if (category.toLowerCase().includes('shoe') || 
        category.toLowerCase().includes('footwear') ||
        subcategory.toLowerCase().includes('sneaker')) {
        categoryData = CATEGORY_ESTIMATES['Shoes'];
    }
    
    // Try to match brand/item - include special attributes for collaboration detection
    let estimate = null;
    const attributesStr = specialAttributes.join(' ').toLowerCase();
    const searchStr = `${brand} ${itemName} ${attributesStr}`.toLowerCase();
    
    // Check for rare collaborations FIRST (most specific matches)
    const collaborationPatterns = [
        { pattern: 'gorillaz', key: 'Converse Gorillaz' },
        { pattern: 'travis scott', key: 'Travis Scott' },
        { pattern: 'off-white', key: 'Off-White' },
        { pattern: 'yeezy', key: 'Yeezy' },
        { pattern: 'supreme', key: 'Supreme' }
    ];
    
    for (const collab of collaborationPatterns) {
        if (searchStr.includes(collab.pattern)) {
            if (categoryData[collab.key]) {
                estimate = categoryData[collab.key];
                console.log(`Detected rare collaboration: ${collab.key} - using higher estimate`);
                break;
            }
        }
    }
    
    // If no collaboration found, try standard brand matching
    if (!estimate) {
        for (const [key, value] of Object.entries(categoryData)) {
            if (key !== 'default' && searchStr.includes(key.toLowerCase())) {
                estimate = value;
                break;
            }
        }
    }
    
    if (!estimate) {
        estimate = categoryData['default'] || CATEGORY_ESTIMATES['default']['default'];
    }
    
    const confidence = itemIdentification.confidence || 0.7;
    const variance = 1 + (1 - confidence) * 0.2;
    
    return {
        low: Math.round(estimate.low / variance),
        high: Math.round(estimate.high * variance),
        avg: Math.round(estimate.avg),
        sold: estimate.sold || 50
    };
}

/**
 * Main function to fetch eBay data
 * Uses Claude web search if API key available, otherwise uses estimates
 */
async function fetchEbayData(itemIdentification, condition = 'good') {
    let searchQuery = buildSearchQuery(itemIdentification);
    
    // Add condition terms to search query
    const conditionTerm = CONDITION_TERMS[condition] || '';
    if (conditionTerm) {
        searchQuery = `${searchQuery} ${conditionTerm}`;
    }
    
    console.log('Searching eBay for:', searchQuery);

    // Try Claude web search first if available
    if (anthropic) {
        console.log('Using Claude web search (optimized single query)...');
        
        try {
            // Single combined API call for both sold and active data
            const result = await searchEbayWithClaude(searchQuery);

            // If we got valid data from Claude
            if (result && (result.sold || result.active)) {
                const sold = result.sold || {};
                const active = result.active || {};
                
                const avgSoldPrice = sold.avg || 0;
                const avgActivePrice = active.avg || 0;
                
                // Determine data source quality
                let dataSource = 'exact';
                if (!sold.count || sold.count < 5) {
                    dataSource = 'similar';
                }

                const baseData = {
                    soldCount: sold.count || 'Unknown',
                    activeCount: active.count || 'Unknown',
                    avgSoldPrice: avgSoldPrice || avgActivePrice,
                    avgActivePrice: avgActivePrice || avgSoldPrice,
                    priceRange: {
                        low: Math.min(sold.low || Infinity, active.low || Infinity) || 0,
                        high: Math.max(sold.high || 0, active.high || 0) || 0
                    },
                    dataSource: dataSource,
                    soldPrices: [],
                    activePrices: [],
                    searchQuery: searchQuery
                };
            }
        } catch (error) {
            console.error('Claude search failed, falling back to estimates:', error.message);
        }
    }

    // Fallback to estimates
    console.log('Using estimated pricing...');
    const estimate = getEstimatedPricing(itemIdentification);
    
    return {
        soldCount: estimate.sold,
        activeCount: Math.round(estimate.sold * 1.2),
        avgSoldPrice: estimate.avg,
        avgActivePrice: Math.round(estimate.avg * 1.1),
        priceRange: {
            low: estimate.low,
            high: estimate.high
        },
        dataSource: 'estimated',
        soldPrices: [],
        activePrices: [],
        searchQuery: searchQuery,
        note: 'Prices estimated based on market data. Add ANTHROPIC_API_KEY for real-time data.'
    };
}

/**
 * Build search query from item identification
 * Uses the most specific details available for accurate eBay matching
 */
function buildSearchQuery(item) {
    const attrs = item.attributes || {};
    
    // If itemName is already very specific (has brand + model + details), use it directly
    const itemName = item.itemName || '';
    if (itemName.length > 30 && item.brand && itemName.toLowerCase().includes(item.brand.toLowerCase())) {
        // Clean up the itemName for search - remove excessive words
        let cleanName = itemName
            .replace(/hiking shoes?|sneakers?|boots?|footwear/gi, '')  // Remove generic terms if too long
            .replace(/\s+/g, ' ')
            .trim();
        
        // If still reasonable length, use it
        if (cleanName.length < 80) {
            console.log('Using specific itemName for search:', cleanName);
            return cleanName;
        }
    }
    
    const parts = [];
    
    // Add brand
    if (item.brand && item.brand !== 'Unknown') parts.push(item.brand);
    
    // Add gender if available
    if (attrs.gender && attrs.gender !== 'Unknown') parts.push(attrs.gender);
    
    // Add model (this is usually the key identifier)
    if (item.model) parts.push(item.model);
    
    // Add width if specified (important for shoes)
    if (attrs.width && attrs.width.toLowerCase() !== 'regular') {
        parts.push(attrs.width);
    }
    
    // Check for special collaborations
    const specialCollabs = ['Gorillaz', 'Supreme', 'Off-White', 'Travis Scott', 'Jordan', 'Yeezy', 'Nike SB', 'Dunk', 'Gore-Tex'];
    const itemText = `${itemName} ${(item.specialAttributes || []).join(' ')}`.toLowerCase();
    
    for (const collab of specialCollabs) {
        if (itemText.includes(collab.toLowerCase()) && !parts.join(' ').toLowerCase().includes(collab.toLowerCase())) {
            parts.push(collab);
        }
    }
    
    const query = parts.join(' ').trim();
    
    // If still too short, use full item name
    if (query.length < 15 && itemName) {
        return itemName.substring(0, 80);
    }
    
    console.log('Built search query:', query);
    return query || item.category || 'item';
}

module.exports = { fetchEbayData };
