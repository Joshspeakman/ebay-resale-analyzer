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
 * Condition search terms to append to eBay query
 */
const CONDITION_TERMS = {
    excellent: 'like new',
    good: '',
    fair: 'used',
    poor: 'for parts'
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
    
    const prompt = `Search the web for eBay listings of: ${searchQuery}

Use web search to find current eBay prices for this item. Search for:
1. "${searchQuery} site:ebay.com sold"
2. "${searchQuery} site:ebay.com"

From the search results, extract pricing data and respond with ONLY this JSON:
{"sold":{"count":10,"low":25.00,"high":80.00,"avg":45.00},"active":{"count":20,"low":30.00,"high":100.00,"avg":55.00}}

Replace the example numbers with real data from your search. If no sold data, use 0 for sold count and estimate from active listings.`;

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
 * Main function to fetch eBay data
 * Requires Claude API for real data - no fake fallbacks
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
        const result = await searchEbayWithClaude(searchQuery);

        if (result && (result.sold || result.active)) {
            const sold = result.sold || {};
            const active = result.active || {};
            
            const avgSoldPrice = sold.avg || 0;
            const avgActivePrice = active.avg || 0;
            
            let dataSource = 'live';
            if (!sold.count || sold.count < 5) {
                dataSource = 'limited';
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
                soldPrices: [],
                activePrices: [],
                searchQuery: searchQuery
            };
        }
        
        // No results found
        return {
            soldCount: 0,
            activeCount: 0,
            avgSoldPrice: 0,
            avgActivePrice: 0,
            priceRange: { low: 0, high: 0 },
            dataSource: 'no-results',
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
