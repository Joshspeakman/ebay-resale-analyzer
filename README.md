# eBay Resale Analyzer

A mobile-first web application that analyzes photos of items and provides actionable resale intelligence for eBay sellers.

## Features

### Core Functionality (v1)
- 📸 **Image-Based Item Identification** - Upload photos to identify brand, model, and category
- 📊 **eBay Sales Data** - View sold count (last 90 days) and active listings
- 💰 **Smart Pricing** - Data-driven price recommendations with quick-sale and premium options
- 🎯 **Confidence Levels** - Clear indication of exact match vs similar items vs category estimates
- 📱 **Mobile-First Design** - Optimized for phone usage while sourcing

### Summary Output
Each analysis returns:
- Identified Item (name, brand, model)
- Match Confidence (exact/similar/category)
- Sold Count (Last 90 Days)
- Active Listings
- Suggested Selling Price
- Price Range & Strategy Options

## Quick Start

### Prerequisites
- Node.js 18+ 
- OpenAI API key (for image analysis)
- eBay Developer API credentials (optional, for live data)

### Installation

1. **Clone or navigate to the project:**
   ```bash
   cd "Ebay Tool"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```
   OPENAI_API_KEY=sk-your-openai-key-here
   EBAY_APP_ID=your-ebay-app-id (optional)
   EBAY_CERT_ID=your-ebay-cert-id (optional)
   ```

4. **Start the server:**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Open in browser:**
   ```
   http://localhost:3000
   ```

## API Keys Setup

### OpenAI API Key (Required)
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Add to `.env` as `OPENAI_API_KEY`

### eBay Developer API (Optional)
The app works with mock data if eBay credentials aren't provided.

For live data:
1. Register at [eBay Developer Program](https://developer.ebay.com/)
2. Create an application
3. Get your App ID, Cert ID, and Dev ID
4. Add to `.env`

## Usage

### On Mobile
1. Open the app URL on your phone
2. Tap the camera icon to take a photo or select from gallery
3. Add up to 5 photos for better identification
4. Tap "Analyze Item"
5. Review the results and pricing recommendations

### Understanding Results

**Confidence Levels:**
- 🟢 **Exact** - High confidence match with specific model identification
- 🟡 **Similar** - Brand identified, model uncertain
- 🔴 **Category** - Generic item type only

**Pricing Options:**
- **Quick Sale** - Lower price for fast turnover (15% below suggested)
- **Recommended** - Optimal balance of price and sell-through
- **Premium** - Higher price for patient sellers (15% above suggested)

## Project Structure

```
Ebay Tool/
├── server.js              # Express server & API routes
├── package.json           # Dependencies
├── .env.example           # Environment template
├── public/
│   ├── index.html         # Main HTML (mobile-first)
│   ├── styles.css         # Responsive CSS
│   └── app.js             # Frontend JavaScript
└── services/
    ├── imageAnalyzer.js   # OpenAI Vision integration
    ├── ebayService.js     # eBay API / data fetching
    └── priceCalculator.js # Price recommendation engine
```

## API Endpoints

### POST /api/analyze
Analyze uploaded images and return resale intelligence.

**Request:**
- `Content-Type: multipart/form-data`
- `images`: Up to 5 image files

**Response:**
```json
{
  "identification": {
    "item": "Sony WH-1000XM4 Wireless Headphones",
    "brand": "Sony",
    "model": "WH-1000XM4",
    "matchConfidence": 0.92,
    "confidenceLevel": "exact"
  },
  "salesData": {
    "soldLast90Days": 156,
    "activeListings": 89,
    "avgSoldPrice": 198.50,
    "dataSource": "exact"
  },
  "pricing": {
    "suggestedPrice": 195,
    "quickSalePrice": 165,
    "premiumPrice": 225
  }
}
```

### GET /api/health
Health check endpoint.

## Limitations & Notes

- **Sold Listings Data**: The eBay Browse API doesn't provide completed/sold listings directly. The current implementation estimates sold data or uses mock data. For production, consider:
  - eBay Finding API (requires additional API access)
  - Web scraping solution
  - Third-party data providers

- **API Rate Limits**: OpenAI and eBay APIs have rate limits. The app handles basic error cases but heavy usage may require additional throttling.

- **Image Quality**: Better photos = better identification. Include brand logos, model numbers, and unique features when possible.

## Future Enhancements (v2+)

- [ ] Discontinued status detection
- [ ] Manufacturing year estimation
- [ ] Limited edition / rare item detection
- [ ] Cross-brand similar item analysis
- [ ] Batch scanning mode
- [ ] PWA offline support
- [ ] Barcode/UPC scanning
- [ ] Direct eBay listing creation

## License

MIT
