const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

/**
 * Analyzes uploaded images using Groq's Llama Vision model (FREE!)
 * @param {string[]} imagePaths - Array of file paths to images
 * @returns {Object} Item identification details
 */
async function analyzeImages(imagePaths) {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
        throw new Error('Groq API key not configured. Get a FREE key at https://console.groq.com/keys');
    }

    const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY
    });

    try {
        // Convert images to base64 for the API
        const imageContents = imagePaths.map(imagePath => {
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Image = imageBuffer.toString('base64');
            const ext = path.extname(imagePath).toLowerCase().slice(1);
            const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
            
            return {
                type: 'image_url',
                image_url: {
                    url: `data:${mimeType};base64,${base64Image}`
                }
            };
        });

        const prompt = `You are an expert product identifier for eBay resale. Analyze the image(s) and identify the EXACT product with maximum specificity.

CRITICAL: Look for ALL identifying details:
- Brand logos/text on the product
- Model names/numbers (often on tags, labels, soles, or the item itself)
- Size, width (e.g., "Wide", "2E"), and fit specifications
- Color names (official color, not just "blue")
- Gender designation (Men's, Women's, Unisex)
- Version/generation (e.g., "Moab 3", "Air Max 90")
- SKU numbers, style codes, or product IDs
- Any text visible on labels, tags, or the product

READ ALL VISIBLE TEXT in the image - tags, labels, boxes, receipts, size labels, tongue labels, insoles, etc.

Respond in JSON format only (no markdown, no code blocks):
{
    "itemName": "EXACT eBay listing title - include: Brand + Gender + Model + Version + Width + Color (e.g., 'Merrell Men Moab 3 Mid Wide Width Hiking Shoes Earth Brown')",
    "brand": "Brand name",
    "model": "Full model name with version (e.g., 'Moab 3 Mid')",
    "category": "Product category",
    "subcategory": "Specific subcategory",
    "confidence": 0.85,
    "searchTerms": ["optimized", "ebay", "search", "terms"],
    "attributes": {
        "color": "Official color name",
        "size": "Size if visible",
        "width": "Width designation (Regular, Wide, Narrow, 2E, 4E, etc.)",
        "gender": "Men, Women, Unisex, Kids",
        "condition_notes": "Visible condition observations",
        "material": "Material if identifiable",
        "era": "vintage, modern, etc.",
        "sku": "SKU or style code if visible",
        "upc": "UPC if visible"
    },
    "specialAttributes": ["Limited Edition", "Collaboration Name", "Waterproof", "Gore-Tex", etc.],
    "discontinued": null,
    "year": null,
    "visibleText": ["All", "text", "you", "can", "read", "in", "the", "image"],
    "identificationReasoning": "How you identified this - what text/logos/features you saw"
}

Confidence scoring:
- 0.90-1.00: Exact item with model number/SKU visible
- 0.70-0.89: Brand and model clear, minor details uncertain
- 0.50-0.69: Brand known, model estimated
- Below 0.50: Category guess only

Be SPECIFIC - "Merrell Men Moab 3 Mid Wide Width Shoes" is better than "Merrell hiking boots".`;

        const response = await groq.chat.completions.create({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        ...imageContents
                    ]
                }
            ],
            max_tokens: 1500,
            temperature: 0.3
        });

        const content = response.choices[0]?.message?.content?.trim();
        
        if (!content) {
            throw new Error('Empty response from Groq');
        }

        // Parse the JSON response
        let parsed;
        try {
            // Remove any potential markdown code blocks
            const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            parsed = JSON.parse(cleanContent);
        } catch (parseError) {
            console.error('Failed to parse Groq response:', content);
            throw new Error('Failed to parse item identification response');
        }

        // Validate and set defaults
        return {
            itemName: parsed.itemName || 'Unknown Item',
            brand: parsed.brand || 'Unknown',
            model: parsed.model || null,
            category: parsed.category || 'General',
            subcategory: parsed.subcategory || null,
            confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
            searchTerms: parsed.searchTerms || [parsed.itemName],
            attributes: parsed.attributes || {},
            specialAttributes: parsed.specialAttributes || [],
            discontinued: parsed.discontinued,
            year: parsed.year,
            visibleText: parsed.visibleText || [],
            reasoning: parsed.identificationReasoning || ''
        };

    } catch (error) {
        console.error('Image analysis error:', error);
        
        if (error.message?.includes('invalid_api_key') || error.message?.includes('API key')) {
            throw new Error('Invalid Groq API key. Get a FREE key at https://console.groq.com/keys');
        }
        
        if (error.status === 429) {
            throw new Error('Rate limit reached. Groq allows 30 requests/minute. Please wait a moment.');
        }
        
        throw new Error(`Image analysis failed: ${error.message}`);
    }
}

module.exports = {
    analyzeImages
};
