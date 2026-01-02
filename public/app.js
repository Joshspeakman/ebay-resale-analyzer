/**
 * eBay Resale Analyzer - Frontend Application
 */

class ResaleAnalyzer {
    constructor() {
        this.selectedFiles = [];
        this.currentResult = null;
        this.selectedCondition = 'good'; // Default condition
        this.history = this.loadHistory();
        
        this.initElements();
        this.bindEvents();
    }

    initElements() {
        // Upload elements
        this.uploadArea = document.getElementById('uploadArea');
        this.imageInput = document.getElementById('imageInput');
        this.previewContainer = document.getElementById('previewContainer');
        this.imagePreviews = document.getElementById('imagePreviews');
        this.addMoreBtn = document.getElementById('addMoreBtn');
        this.analyzeBtn = document.getElementById('analyzeBtn');
        
        // Condition selector
        this.conditionSelector = document.getElementById('conditionSelector');
        this.conditionBtns = document.querySelectorAll('.condition-btn');

        // Results elements
        this.uploadSection = document.getElementById('uploadSection');
        this.resultsSection = document.getElementById('resultsSection');
        
        // Loading & error
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorToast = document.getElementById('errorToast');
        this.errorMessage = document.getElementById('errorMessage');

        // History
        this.historyBtn = document.getElementById('historyBtn');
        this.historyModal = document.getElementById('historyModal');
        this.closeHistoryBtn = document.getElementById('closeHistoryBtn');
        this.historyList = document.getElementById('historyList');

        // Action buttons
        this.newScanBtn = document.getElementById('newScanBtn');
        this.searchEbayBtn = document.getElementById('searchEbayBtn');
    }

    bindEvents() {
        // Upload events
        this.uploadArea.addEventListener('click', () => this.imageInput.click());
        this.imageInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.addMoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.imageInput.click();
        });
        this.analyzeBtn.addEventListener('click', () => this.analyzeImages());
        
        // Condition selector events
        this.conditionBtns.forEach(btn => {
            btn.addEventListener('click', () => this.selectCondition(btn));
        });

        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('drag-over');
        });
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('drag-over');
        });
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('drag-over');
            this.handleDrop(e);
        });

        // History events
        this.historyBtn.addEventListener('click', () => this.showHistory());
        this.closeHistoryBtn.addEventListener('click', () => this.hideHistory());
        document.querySelector('.modal-backdrop')?.addEventListener('click', () => this.hideHistory());

        // Action buttons
        this.newScanBtn.addEventListener('click', () => this.resetToUpload());
        this.searchEbayBtn.addEventListener('click', () => this.openEbaySearch());
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.addFiles(files);
    }

    handleDrop(e) {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        this.addFiles(files);
    }

    addFiles(files) {
        const remaining = 5 - this.selectedFiles.length;
        const toAdd = files.slice(0, remaining);
        
        toAdd.forEach(file => {
            if (file.size > 10 * 1024 * 1024) {
                this.showError(`${file.name} is too large (max 10MB)`);
                return;
            }
            this.selectedFiles.push(file);
        });

        this.updatePreviews();
        this.imageInput.value = '';
    }
    
    selectCondition(btn) {
        this.conditionBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCondition = btn.dataset.condition;
    }

    updatePreviews() {
        if (this.selectedFiles.length === 0) {
            this.previewContainer.hidden = true;
            this.conditionSelector.hidden = true;
            this.analyzeBtn.disabled = true;
            return;
        }

        this.previewContainer.hidden = false;
        this.conditionSelector.hidden = false;
        this.analyzeBtn.disabled = false;
        this.imagePreviews.innerHTML = '';

        this.selectedFiles.forEach((file, index) => {
            const preview = document.createElement('div');
            preview.className = 'preview-item';
            
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.alt = file.name;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'preview-remove';
            removeBtn.innerHTML = '×';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile(index);
            });

            preview.appendChild(img);
            preview.appendChild(removeBtn);
            this.imagePreviews.appendChild(preview);
        });

        // Hide add more button if at limit
        this.addMoreBtn.style.display = this.selectedFiles.length >= 5 ? 'none' : 'flex';
    }

    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        this.updatePreviews();
    }

    async analyzeImages() {
        if (this.selectedFiles.length === 0) return;

        this.showLoading();

        try {
            const formData = new FormData();
            this.selectedFiles.forEach(file => {
                formData.append('images', file);
            });
            
            // Add condition to form data
            formData.append('condition', this.selectedCondition);

            // Animate loading steps
            this.animateLoadingStep(1);

            const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData
            });

            this.animateLoadingStep(2);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Analysis failed');
            }

            this.animateLoadingStep(3);

            const result = await response.json();
            this.currentResult = result;

            // Save to history
            this.saveToHistory(result);

            // Small delay for visual feedback
            await new Promise(r => setTimeout(r, 500));

            this.displayResults(result);

        } catch (error) {
            console.error('Analysis error:', error);
            this.showError(error.message || 'Failed to analyze image');
        } finally {
            this.hideLoading();
        }
    }

    showLoading() {
        this.loadingOverlay.hidden = false;
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active', 'done');
        });
    }

    hideLoading() {
        this.loadingOverlay.hidden = true;
    }

    animateLoadingStep(stepNum) {
        const steps = document.querySelectorAll('.step');
        steps.forEach((step, index) => {
            if (index + 1 < stepNum) {
                step.classList.remove('active');
                step.classList.add('done');
            } else if (index + 1 === stepNum) {
                step.classList.add('active');
                step.classList.remove('done');
            }
        });
    }

    displayResults(result) {
        console.log('displayResults called with:', result);
        const { identification, salesData, pricing, extras, searchTerms } = result;

        // Switch to results view - use both hidden attribute and class
        this.uploadSection.hidden = true;
        this.uploadSection.classList.add('is-hidden');
        
        this.resultsSection.hidden = false;
        this.resultsSection.classList.remove('is-hidden');
        this.resultsSection.classList.add('is-visible');
        
        console.log('resultsSection hidden:', this.resultsSection.hidden);
        console.log('resultsSection classList:', this.resultsSection.classList.toString());

        // Item identification
        document.getElementById('itemName').textContent = identification.item;
        document.getElementById('itemBrand').textContent = 
            `${identification.brand}${identification.model ? ' - ' + identification.model : ''}`;

        // Confidence badge
        const confidenceBadge = document.getElementById('confidenceBadge');
        confidenceBadge.textContent = identification.confidenceLevel;
        confidenceBadge.className = `confidence-badge ${identification.confidenceLevel}`;

        // Pricing
        document.getElementById('suggestedPrice').textContent = this.formatPrice(pricing.suggestedPrice);
        document.getElementById('quickSalePrice').textContent = this.formatPrice(pricing.quickSalePrice);
        document.getElementById('recommendedPrice').textContent = this.formatPrice(pricing.suggestedPrice);
        document.getElementById('premiumPrice').textContent = this.formatPrice(pricing.premiumPrice);

        // Stats
        document.getElementById('soldCount').textContent = salesData.soldLast90Days || '--';
        document.getElementById('activeCount').textContent = salesData.activeListings || '--';
        document.getElementById('avgSoldPrice').textContent = this.formatPrice(salesData.avgSoldPrice);

        // Price range
        if (salesData.priceRange) {
            document.getElementById('priceRange').textContent = 
                `${this.formatPrice(salesData.priceRange.low)} - ${this.formatPrice(salesData.priceRange.high)}`;
        }

        // Data source with new fallback types
        const dataSourceEl = document.getElementById('dataSource');
        const sourceBadge = dataSourceEl.querySelector('.source-badge');
        const sourceText = dataSourceEl.querySelector('.source-text');
        
        // Map new data sources to display labels
        const sourceLabels = {
            'live': 'live',
            'exact-match': 'exact',
            'limited': 'limited',
            'similar-items': 'similar',
            'category-estimate': 'category',
            'no-results': 'none',
            'error': 'error'
        };
        
        const displayLabel = sourceLabels[salesData.dataSource] || salesData.dataSource;
        sourceBadge.textContent = displayLabel;
        sourceBadge.className = `source-badge ${displayLabel}`;
        
        // Use sourceNote from backend if available, otherwise use default descriptions
        const sourceDescriptions = {
            'live': 'Based on exact item matches',
            'exact-match': 'Based on exact item matches',
            'exact': 'Based on exact item matches',
            'limited': 'Limited listings found - price may vary',
            'similar-items': 'Based on similar items',
            'similar': 'Based on similar items',
            'category-estimate': 'Estimated from category data',
            'category': 'Estimated from category data',
            'no-results': 'No listings found',
            'estimated': 'AI-based market estimate'
        };
        
        // Prefer backend sourceNote, fallback to descriptions
        sourceText.textContent = salesData.sourceNote || sourceDescriptions[salesData.dataSource] || '';

        // Quality notes
        const qualityNotes = document.getElementById('qualityNotes');
        qualityNotes.innerHTML = '';
        if (extras.dataQualityNotes && extras.dataQualityNotes.length > 0) {
            extras.dataQualityNotes.forEach(note => {
                const li = document.createElement('li');
                li.textContent = note;
                qualityNotes.appendChild(li);
            });
        }

        // Search terms
        const searchTermsEl = document.getElementById('searchTerms');
        searchTermsEl.innerHTML = '';
        if (searchTerms && searchTerms.length > 0) {
            searchTerms.slice(0, 8).forEach(term => {
                const span = document.createElement('span');
                span.className = 'search-term';
                span.textContent = term;
                span.addEventListener('click', () => {
                    window.open(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(term)}`, '_blank');
                });
                searchTermsEl.appendChild(span);
            });
        }

        // Extras card
        const extrasCard = document.getElementById('extrasCard');
        const extrasContent = document.getElementById('extrasContent');
        
        const hasExtras = extras.discontinued !== null || 
                         extras.manufacturingYear || 
                         (extras.specialAttributes && extras.specialAttributes.length > 0);
        
        if (hasExtras) {
            extrasCard.hidden = false;
            extrasContent.innerHTML = '';
            
            if (extras.discontinued !== null) {
                const p = document.createElement('p');
                p.innerHTML = `<strong>Status:</strong> ${extras.discontinued ? 'Discontinued' : 'Currently available'}`;
                extrasContent.appendChild(p);
            }
            
            if (extras.manufacturingYear) {
                const p = document.createElement('p');
                p.innerHTML = `<strong>Year:</strong> ${extras.manufacturingYear}`;
                extrasContent.appendChild(p);
            }
            
            if (extras.specialAttributes && extras.specialAttributes.length > 0) {
                const p = document.createElement('p');
                p.innerHTML = '<strong>Special:</strong> ';
                extras.specialAttributes.forEach(attr => {
                    const tag = document.createElement('span');
                    tag.className = 'extra-tag';
                    tag.textContent = attr;
                    p.appendChild(tag);
                });
                extrasContent.appendChild(p);
            }
        } else {
            extrasCard.hidden = true;
        }
    }

    formatPrice(price) {
        if (price === null || price === undefined) return '--';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(price);
    }

    resetToUpload() {
        this.selectedFiles = [];
        this.currentResult = null;
        this.selectedCondition = 'good';
        this.updatePreviews();
        
        // Reset condition selector
        this.conditionBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.condition === 'good');
        });
        this.conditionSelector.hidden = true;
        
        // Hide results, show upload
        this.resultsSection.hidden = true;
        this.resultsSection.classList.add('is-hidden');
        this.resultsSection.classList.remove('is-visible');
        
        this.uploadSection.hidden = false;
        this.uploadSection.classList.remove('is-hidden');
    }

    openEbaySearch() {
        if (!this.currentResult) return;
        
        const searchQuery = this.currentResult.searchTerms?.[0] || 
                           this.currentResult.identification?.item || '';
        
        window.open(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}&LH_Sold=1&LH_Complete=1`, '_blank');
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorToast.hidden = false;
        
        setTimeout(() => {
            this.errorToast.hidden = true;
        }, 5000);
    }

    // History management
    loadHistory() {
        try {
            return JSON.parse(localStorage.getItem('resaleHistory') || '[]');
        } catch {
            return [];
        }
    }

    saveToHistory(result) {
        const historyItem = {
            id: Date.now(),
            item: result.identification.item,
            brand: result.identification.brand,
            price: result.pricing.suggestedPrice,
            confidence: result.identification.confidenceLevel,
            timestamp: result.timestamp,
            searchTerms: result.searchTerms
        };

        this.history.unshift(historyItem);
        this.history = this.history.slice(0, 50); // Keep last 50
        
        try {
            localStorage.setItem('resaleHistory', JSON.stringify(this.history));
        } catch (e) {
            console.warn('Failed to save history:', e);
        }
    }

    showHistory() {
        this.historyModal.hidden = false;
        this.renderHistoryList();
    }

    hideHistory() {
        this.historyModal.hidden = true;
    }

    renderHistoryList() {
        if (this.history.length === 0) {
            this.historyList.innerHTML = '<p class="empty-history">No scans yet</p>';
            return;
        }

        this.historyList.innerHTML = this.history.map(item => `
            <div class="history-item" data-search="${encodeURIComponent(item.searchTerms?.[0] || item.item)}">
                <div class="history-item-info">
                    <div class="history-item-name">${this.escapeHtml(item.item)}</div>
                    <div class="history-item-price">${this.formatPrice(item.price)}</div>
                    <div class="history-item-date">${this.formatDate(item.timestamp)}</div>
                </div>
                <span class="confidence-badge ${item.confidence}">${item.confidence}</span>
            </div>
        `).join('');

        // Add click handlers
        this.historyList.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', () => {
                const searchQuery = decodeURIComponent(el.dataset.search);
                window.open(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}`, '_blank');
                this.hideHistory();
            });
        });
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ResaleAnalyzer();
});

// Register service worker for PWA capabilities (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Service worker registration would go here
        // navigator.serviceWorker.register('/sw.js');
    });
}
