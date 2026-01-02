/**
 * eBay Data Service - Production Version
 * Uses Claude web search for real-time eBay data
 * No fake fallback data - requires ANTHROPIC_API_KEY
 */

const Anthropic = require('@anthropic-ai/sdk');

// Check if Claude API key is available
const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY;
let anthropic = null;

if (hasClaudeKey) {
    anthropic = new Anthropic();
    console.log('✅ Claude API configured - real-time eBay search enabled');
} else {
    console.log('⚠️  No ANTHROPIC_API_KEY - eBay pricing will not be available');
}

/**
 * eBay condition search terms - full spectrum for accurate pricing
 */
const CONDITION_TERMS = {
    'new': 'new',
    'open-box': 'open box',
    'like-new': 'like new',
    'used': 'used pre-owned',
    'good': 'good condition',
    'for-parts': 'for parts not working'
};

/**
 * Extract JSON from Claude's response text
 */
function extractJSON(text) {
    if (!text) return null;
    
    try {
        return JSON.parse(text);
    } catch (e) {
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
 * Get text content from Claude response
 */
function getResponseText(response) {
    if (!response?.content) return '';
    
    return response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
}

/**
 * Search eBay using Claude's web search capability
 */
async function searchEbayWithClaude(searchQuery) {
    if (!anthropic) return null;
    
    const prompt = `You MUST use web search to find real eBay pricing data for: "${searchQuery}"

REQUIRED: Search for this item on eBay and find:
1. SOLD listings - what prices did this item actually sell for?
2. ACTIVE listings - what are current asking prices?

After searching, analyze the results and return ONLY valid JSON in this exact format:
{"sold":{"count":NUMBER,"low":PRICE,"high":PRICE,"avg":PRICE},"active":{"count":NUMBER,"low":PRICE,"high":PRICE,"avg":PRICE}}

IMPORTANT:
- Use REAL numbers from your web search results
- Prices should be in USD without $ symbol
- If you find 0 sold listings, set sold count to 0
- DO NOT use placeholder or example numbers
- ONLY return the JSON, no other text`;

    try {
        console.log('Calling Claude web search for:', searchQuery);
        
        const response = await anthropic.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1024,
            tools: [{ 
                type: 'web_search_20250305',
                name: 'web_search',
                max_uses: 5
            }],
            tool_choice: { type: 'auto' },
            messages: [{ role: 'user', content: prompt }]
        });

        console.log('Claude response received, content blocks:', response.content?.length);
        
        // Check if web search was used
        const hasWebSearch = response.content?.some(block => 
            block.type === 'tool_use' || block.type === 'web_search_tool_result'
        );
        console.log('Web search used:', hasWebSearch);
        
        // If web search wasn't used, log a warning
        if (!hasWebSearch) {
            console.warn('WARNING: Claude did not use web search - results may be inaccurate');
        }
        
        const text = getResponseText(response);
        console.log('Extracted text:', text?.substring(0, 500));
        
        const data = extractJSON(text);
        
        if (data) {
            console.log('Claude search result:', data);
            return data;
        }
        
        console.log('No JSON data extracted from response');
        return null;
    } catch (error) {
        console.error('Claude search error:', error.message);
        console.error('Full error:', JSON.stringify(error, null, 2));
        throw error;
    }
}

/**
 * Build a broader search query by removing specifics
 */
function buildBroadSearchQuery(item, level = 1) {
    const attrs = item.attributes || {};
    const parts = [];
    
    if (level === 1) {
        // Level 1: Brand + Model only (no condition, no special attributes)
        if (item.brand && item.brand !== 'Unknown') parts.push(item.brand);
        if (item.model) parts.push(item.model);
    } else if (level === 2) {
        // Level 2: Brand + Category (very broad)
        if (item.brand && item.brand !== 'Unknown') parts.push(item.brand);
        if (item.category) parts.push(item.category);
    } else {
        // Level 3: Just category/type
        if (item.category) parts.push(item.category);
        if (attrs.gender && attrs.gender !== 'Unknown') parts.push(attrs.gender);
    }
    
    const query = parts.join(' ').trim();
    return query.length >= 5 ? query : null;
}

/**
 * Check if search results are sufficient
 */
function hasEnoughData(result, minSold = 3) {
    if (!result) return false;
    const soldCount = result.sold?.count || 0;
    const activeCount = result.active?.count || 0;
    return soldCount >= minSold || (soldCount >= 1 && activeCount >= 5);
}

/**
 * Main function to fetch eBay data
 * Implements fallback: specific → broad → category search
 * Tracks data source for transparency
 */
async function fetchEbayData(itemIdentification, condition = 'good') {
    let searchQuery = buildSearchQuery(itemIdentification);
    
    // Add condition terms to search query
    const conditionTerm = CONDITION_TERMS[condition] || '';
    if (conditionTerm) {
        searchQuery = `${searchQuery} ${conditionTerm}`;
    }
    
    console.log('Searching eBay for:', searchQuery);

    // Require Claude API for real data
    if (!anthropic) {
        return {
            soldCount: 'N/A',
            activeCount: 'N/A',
            avgSoldPrice: 0,
            avgActivePrice: 0,
            priceRange: { low: 0, high: 0 },
            dataSource: 'unavailable',
            soldPrices: [],
            activePrices: [],
            searchQuery: searchQuery,
            error: 'ANTHROPIC_API_KEY required for real-time eBay data'
        };
    }

    try {
        // STEP 1: Try specific search with condition
        console.log('🔍 Step 1: Specific search with condition');
        let result = await searchEbayWithClaude(searchQuery);
        let dataSource = 'exact-match';
        let usedQuery = searchQuery;
        
        // STEP 2: If limited results, try broader search without condition
        if (!hasEnoughData(result)) {
            const broadQuery1 = buildBroadSearchQuery(itemIdentification, 1);
            if (broadQuery1 && broadQuery1 !== searchQuery) {
                console.log('🔍 Step 2: Broad search (brand + model):', broadQuery1);
                const broadResult = await searchEbayWithClaude(broadQuery1);
                if (hasEnoughData(broadResult)) {
                    result = broadResult;
                    dataSource = 'similar-items';
                    usedQuery = broadQuery1;
                } else if (broadResult && (!result || (broadResult.sold?.count || 0) > (result?.sold?.count || 0))) {
                    // Use broader result if it has more data
                    result = broadResult;
                    dataSource = 'similar-items';
                    usedQuery = broadQuery1;
                }
            }
        }
        
        // STEP 3: If still limited, try category-level search
        if (!hasEnoughData(result)) {
            const broadQuery2 = buildBroadSearchQuery(itemIdentification, 2);
            if (broadQuery2 && broadQuery2 !== usedQuery) {
                console.log('🔍 Step 3: Category search (brand + category):', broadQuery2);
                const categoryResult = await searchEbayWithClaude(broadQuery2);
                if (hasEnoughData(categoryResult)) {
                    result = categoryResult;
                    dataSource = 'category-estimate';
                    usedQuery = broadQuery2;
                } else if (categoryResult && (!result || (categoryResult.sold?.count || 0) > (result?.sold?.count || 0))) {
                    result = categoryResult;
                    dataSource = 'category-estimate';
                    usedQuery = broadQuery2;
                }
            }
        }

        if (result && (result.sold || result.active)) {
            const sold = result.sold || {};
            const active = result.active || {};
            
            const avgSoldPrice = sold.avg || 0;
            const avgActivePrice = active.avg || 0;
            
            // Refine dataSource based on result quality
            if (sold.count && sold.count >= 10) {
                dataSource = dataSource === 'exact-match' ? 'live' : dataSource;
            } else if (sold.count && sold.count >= 5) {
                dataSource = dataSource === 'exact-match' ? 'live' : dataSource;
            } else if (sold.count && sold.count < 5) {
                dataSource = dataSource === 'exact-match' ? 'limited' : dataSource;
            }

            return {
                soldCount: sold.count || 0,
                activeCount: active.count || 0,
                avgSoldPrice: avgSoldPrice || avgActivePrice,
                avgActivePrice: avgActivePrice || avgSoldPrice,
                priceRange: {
                    low: Math.min(sold.low || Infinity, active.low || Infinity) || 0,
                    high: Math.max(sold.high || 0, active.high || 0) || 0
                },
                dataSource: dataSource,
                sourceNote: getSourceNote(dataSource, usedQuery, searchQuery),
                soldPrices: [],
                activePrices: [],
                searchQuery: usedQuery,
                originalQuery: searchQuery !== usedQuery ? searchQuery : undefined
            };
        }
        
        // No results found even with fallbacks
        return {
            soldCount: 0,
            activeCount: 0,
            avgSoldPrice: 0,
            avgActivePrice: 0,
            priceRange: { low: 0, high: 0 },
            dataSource: 'no-results',
            sourceNote: 'No eBay listings found for this item',
            soldPrices: [],
            activePrices: [],
            searchQuery: searchQuery,
            note: 'No eBay listings found for this item'
        };
        
    } catch (error) {
        console.error('eBay search failed:', error.message);
        return {
            soldCount: 'Error',
            activeCount: 'Error',
            avgSoldPrice: 0,
            avgActivePrice: 0,
            priceRange: { low: 0, high: 0 },
            dataSource: 'error',
            soldPrices: [],
            activePrices: [],
            searchQuery: searchQuery,
            error: error.message
        };
    }
}

/**
 * Get human-readable source note explaining data origin
 */
function getSourceNote(dataSource, usedQuery, originalQuery) {
    switch (dataSource) {
        case 'live':
        case 'exact-match':
            return 'Based on exact item matches';
        case 'limited':
            return 'Limited listings found - price may vary';
        case 'similar-items':
            return `Based on similar items: "${usedQuery}"`;
        case 'category-estimate':
            return `Estimated from category: "${usedQuery}"`;
        default:
            return null;
    }
}

/**
 * Build search query from item identification
 */
function buildSearchQuery(item) {
    const attrs = item.attributes || {};
    const itemName = item.itemName || '';
    
    // If itemName is specific enough, use it directly
    if (itemName.length > 25 && item.brand && itemName.toLowerCase().includes(item.brand.toLowerCase())) {
        let cleanName = itemName
            .replace(/\s+/g, ' ')
            .trim();
        
        if (cleanName.length < 80) {
            console.log('Using itemName for search:', cleanName);
            return cleanName;
        }
    }
    
    const parts = [];
    
    // Add brand
    if (item.brand && item.brand !== 'Unknown') parts.push(item.brand);
    
    // Add gender if available
    if (attrs.gender && attrs.gender !== 'Unknown') parts.push(attrs.gender);
    
    // Add model
    if (item.model) parts.push(item.model);
    
    // Add width if specified
    if (attrs.width && attrs.width.toLowerCase() !== 'regular') {
        parts.push(attrs.width);
    }
    
    // Add special attributes
    const specialAttrs = item.specialAttributes || [];
    for (const attr of specialAttrs.slice(0, 2)) {
        if (!parts.join(' ').toLowerCase().includes(attr.toLowerCase())) {
            parts.push(attr);
        }
    }
    
    const query = parts.join(' ').trim();
    
    if (query.length < 10 && itemName) {
        return itemName.substring(0, 80);
    }
    
    console.log('Built search query:', query);
    return query || item.category || 'item';
}

module.exports = { fetchEbayData };
