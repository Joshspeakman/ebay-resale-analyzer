require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Import services
const imageAnalyzer = require('./services/imageAnalyzer');
const ebayService = require('./services/ebayService');
const priceCalculator = require('./services/priceCalculator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    }
});

// Main analysis endpoint
app.post('/api/analyze', upload.array('images', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }

        const condition = req.body.condition || 'good';
        console.log(`Analyzing ${req.files.length} image(s) with condition: ${condition}...`);

        // Step 1: Analyze images with AI to identify the item
        const imagePaths = req.files.map(f => f.path);
        const itemIdentification = await imageAnalyzer.analyzeImages(imagePaths);

        console.log('Item identified:', itemIdentification);

        // Step 2: Fetch eBay data based on identification and condition
        const ebayData = await ebayService.fetchEbayData(itemIdentification, condition);

        console.log('eBay data fetched:', ebayData);

        // Step 3: Calculate suggested price
        const priceAnalysis = priceCalculator.calculateSuggestedPrice(ebayData);

        // Step 4: Compile results
        const result = {
            identification: {
                item: itemIdentification.itemName,
                brand: itemIdentification.brand,
                model: itemIdentification.model,
                category: itemIdentification.category,
                matchConfidence: itemIdentification.confidence,
                confidenceLevel: getConfidenceLevel(itemIdentification.confidence),
                attributes: itemIdentification.attributes || {}
            },
            salesData: {
                soldLast90Days: ebayData.soldCount,
                activeListings: ebayData.activeCount,
                dataSource: ebayData.dataSource, // 'exact', 'similar', or 'category'
                avgSoldPrice: ebayData.avgSoldPrice,
                avgActivePrice: ebayData.avgActivePrice,
                priceRange: ebayData.priceRange
            },
            pricing: {
                suggestedPrice: priceAnalysis.suggestedPrice,
                quickSalePrice: priceAnalysis.quickSalePrice,
                premiumPrice: priceAnalysis.premiumPrice,
                priceConfidence: priceAnalysis.confidence,
                methodology: priceAnalysis.methodology
            },
            extras: {
                discontinued: itemIdentification.discontinued || null,
                manufacturingYear: itemIdentification.year || null,
                specialAttributes: itemIdentification.specialAttributes || [],
                dataQualityNotes: generateDataQualityNotes(ebayData, priceAnalysis)
            },
            searchTerms: itemIdentification.searchTerms,
            timestamp: new Date().toISOString()
        };

        // Cleanup uploaded files
        imagePaths.forEach(p => {
            try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
        });

        res.json(result);

    } catch (error) {
        console.error('Analysis error:', error);
        
        // Cleanup on error
        if (req.files) {
            req.files.forEach(f => {
                try { fs.unlinkSync(f.path); } catch (e) { /* ignore */ }
            });
        }
        
        res.status(500).json({ 
            error: 'Analysis failed', 
            message: error.message 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        services: {
            openai: !!process.env.OPENAI_API_KEY,
            ebay: !!process.env.EBAY_APP_ID
        }
    });
});

// Helper functions
function getConfidenceLevel(confidence) {
    if (confidence >= 0.85) return 'exact';
    if (confidence >= 0.65) return 'similar';
    return 'category';
}

function generateDataQualityNotes(ebayData, priceAnalysis) {
    const notes = [];
    
    if (ebayData.soldCount < 5) {
        notes.push('Low sales volume - price estimate may be less reliable');
    }
    if (ebayData.activeCount > ebayData.soldCount * 3) {
        notes.push('High competition - many active listings compared to sales');
    }
    if (ebayData.dataSource !== 'exact') {
        notes.push(`Data based on ${ebayData.dataSource} items - exact match not found`);
    }
    if (priceAnalysis.outlierCount > 0) {
        notes.push(`${priceAnalysis.outlierCount} outlier(s) excluded from price calculation`);
    }
    
    return notes;
}

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
        }
    }
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`🚀 eBay Resale Analyzer running on port ${PORT}`);
    console.log(`📱 Open http://localhost:${PORT} in your browser`);
});
