// Spanish Sentence Processor App
class SentenceProcessorApp {
  constructor() {
    this.processedSentences = null;
    this.isOnline = navigator.onLine;
    this.initializeApp();
  }

  async initializeApp() {
    try {
      // Initialize database
      await cardDB.init();
      console.log('Database initialized');

      // Initialize sync engine
      syncEngine.startAutoSync();
      syncEngine.addSyncListener(this.handleSyncEvent.bind(this));

      // Initialize UI
      this.initializeUI();
      this.setupEventListeners();
      this.updateUI();

      console.log('Sentence processor initialized successfully');

    } catch (error) {
      console.error('App initialization failed:', error);
      this.showError('Failed to initialize app: ' + error.message);
    }
  }

  initializeUI() {
    // Cache DOM elements
    this.elements = {
      // Form elements
      sentenceForm: document.getElementById('sentenceForm'),
      sentenceInput: document.getElementById('sentenceInput'),
      processBtn: document.getElementById('processBtn'),

      // Section elements
      loadingSection: document.getElementById('loadingSection'),
      resultsSection: document.getElementById('resultsSection'),
      errorSection: document.getElementById('errorSection'),

      // Result elements
      sentenceGrid: document.getElementById('sentenceGrid'),
      processedCount: document.getElementById('processedCount'),

      // Action buttons
      saveBtn: document.getElementById('saveBtn'),
      processAnotherBtn: document.getElementById('processAnotherBtn'),
      retryBtn: document.getElementById('retryBtn'),
      offlineBtn: document.getElementById('offlineBtn'),

      // Status indicators
      offlineIndicator: document.getElementById('offlineIndicator'),
      syncIndicator: document.getElementById('syncIndicator'),
      cardCount: document.getElementById('cardCount'),
      syncStatus: document.getElementById('syncStatus'),

      // Loading elements
      loadingText: document.getElementById('loadingText'),
      loadingSubtext: document.getElementById('loadingSubtext')
    };
  }

  setupEventListeners() {
    // Form submission
    this.elements.sentenceForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.processSentences();
    });

    // Action buttons
    this.elements.saveBtn.addEventListener('click', () => this.saveSentences());
    this.elements.processAnotherBtn.addEventListener('click', () => this.resetForm());
    this.elements.retryBtn.addEventListener('click', () => this.retryProcessing());
    this.elements.offlineBtn.addEventListener('click', () => this.handleOfflineMode());

    // Online/offline events
    window.addEventListener('online', () => this.handleOnlineStatus(true));
    window.addEventListener('offline', () => this.handleOnlineStatus(false));

    // Service worker messages
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data.type === 'SYNC_REQUESTED') {
        syncEngine.syncCards();
      }
    });
  }

  async processSentences() {
    const text = this.elements.sentenceInput.value.trim();

    if (!text) {
      this.showError('Please enter some Spanish sentences');
      return;
    }

    this.showLoading('Processing sentences...', 'Correcting spelling, adding accents, and translating');

    try {
      let processedData;

      if (this.isOnline) {
        processedData = await this.processSentencesOnline(text);
      } else {
        processedData = await this.processSentencesOffline(text);
      }

      this.processedSentences = processedData;
      this.displayResults(processedData);

    } catch (error) {
      console.error('Processing error:', error);
      this.showError('Failed to process sentences: ' + error.message);
    }
  }

  async processSentencesOnline(text) {
    // Split text into individual sentences
    const sentences = this.splitIntoSentences(text);

    this.elements.loadingSubtext.textContent = `Processing ${sentences.length} sentences...`;

    const processedSentences = [];
    let successCount = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      if (sentence.length < 3) continue; // Skip very short fragments

      this.elements.loadingSubtext.textContent = `Processing sentence ${i + 1} of ${sentences.length}...`;

      try {
        const prompt = `Fix any typos and add missing accents to this Spanish sentence, then provide an English translation. If there are verbs, briefly note their tenses. Return in this exact JSON format:
{
  "corrected_spanish": "corrected sentence with proper accents",
  "english_translation": "English translation",
  "verb_info": "Brief note about main verbs and tenses (if any)"
}

Spanish sentence: ${sentence}

Only return the JSON, no other text.`;

        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gemma3n:latest',
            prompt: prompt,
            stream: false
          })
        });

        if (response.ok) {
          const result = await response.json();
          const generatedText = result.response || '';

          const jsonStart = generatedText.indexOf('{');
          const jsonEnd = generatedText.lastIndexOf('}') + 1;
          const jsonText = generatedText.slice(jsonStart, jsonEnd);

          const sentenceData = JSON.parse(jsonText);
          sentenceData.original_sentence = sentence;
          processedSentences.push(sentenceData);
          successCount++;
        }
      } catch (error) {
        console.error(`Failed to process sentence: ${sentence}`, error);
        // Continue with next sentence instead of failing completely
      }
    }

    if (processedSentences.length === 0) {
      throw new Error('No sentences could be processed successfully');
    }

    return {
      processed_sentences: processedSentences,
      count: processedSentences.length,
      total_attempted: sentences.length
    };
  }

  async processSentencesOffline(text) {
    const sentences = this.splitIntoSentences(text);

    const processedSentences = sentences.map(sentence => ({
      original_sentence: sentence,
      corrected_spanish: sentence,
      english_translation: 'Translation not available offline',
      verb_info: 'Verb analysis not available offline'
    }));

    return {
      processed_sentences: processedSentences,
      count: processedSentences.length,
      total_attempted: sentences.length
    };
  }

  splitIntoSentences(text) {
    // Split by line breaks first
    const lines = text.trim().split('\n');
    const sentences = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Split by sentence endings (. ! ? but not abbreviations)
      const sentenceParts = trimmedLine.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑa-záéíóúñ¿¡])/);

      for (const part of sentenceParts) {
        const trimmedPart = part.trim();
        if (trimmedPart && trimmedPart.length >= 3) {
          sentences.push(trimmedPart);
        }
      }
    }

    return sentences;
  }

  displayResults(data) {
    this.hideAllSections();

    const sentenceGrid = this.elements.sentenceGrid;
    const processedCount = this.elements.processedCount;

    const sentences = data.processed_sentences || [];

    if (sentences.length > 0) {
      sentenceGrid.innerHTML = sentences
        .map(sentence => this.createSentencePreview(sentence))
        .join('');

      let countText = `${sentences.length} sentences processed`;
      if (data.total_attempted > sentences.length) {
        countText += ` (${data.total_attempted - sentences.length} failed)`;
      }
      processedCount.textContent = countText;
    } else {
      sentenceGrid.innerHTML = '<p class="no-sentences">No sentences processed</p>';
      processedCount.textContent = '0 sentences processed';
    }

    this.elements.resultsSection.style.display = 'block';
  }

  createSentencePreview(sentence) {
    const hasChanges = sentence.original_sentence !== sentence.corrected_spanish;
    const changeIndicator = hasChanges ? '<span class="change-indicator">✏️ Corrected</span>' : '';

    return `
      <div class="sentence-preview">
        <div class="sentence-card">
          <div class="original-section">
            <h5>Original:</h5>
            <p class="original-text">${sentence.original_sentence}</p>
          </div>

          <div class="corrected-section">
            <h5>Corrected Spanish: ${changeIndicator}</h5>
            <p class="corrected-text">${sentence.corrected_spanish}</p>
          </div>

          <div class="translation-section">
            <h5>English Translation:</h5>
            <p class="translation-text">${sentence.english_translation}</p>
          </div>

          ${sentence.verb_info && sentence.verb_info !== 'Verb analysis not available offline' ?
            `<div class="verb-info-section">
              <h5>Verb Notes:</h5>
              <p class="verb-info">${sentence.verb_info}</p>
            </div>` : ''
          }
        </div>
      </div>
    `;
  }

  async saveSentences() {
    if (!this.processedSentences || !this.processedSentences.processed_sentences) {
      this.showError('No sentences to save');
      return;
    }

    this.elements.saveBtn.disabled = true;
    this.elements.saveBtn.innerHTML = '💾 Saving...';

    try {
      const sentences = this.processedSentences.processed_sentences.map(sentence => ({
        spanish_sentence: sentence.corrected_spanish,
        english_translation: sentence.english_translation,
        grammar_notes: sentence.verb_info || '',
        original_sentence: sentence.original_sentence
      }));

      const savedCards = await cardDB.saveSentenceCards(sentences);

      // Show success
      this.elements.saveBtn.innerHTML = '✅ Cards Saved!';
      this.elements.saveBtn.classList.add('success');

      // Update UI stats
      await this.updateUI();

      // Trigger sync if online
      if (this.isOnline) {
        syncEngine.syncCards();
      }

      // Reset button after 2 seconds
      setTimeout(() => {
        this.elements.saveBtn.disabled = false;
        this.elements.saveBtn.innerHTML = '💾 Save as Flashcards';
        this.elements.saveBtn.classList.remove('success');
      }, 2000);

    } catch (error) {
      console.error('Save error:', error);
      this.showError('Failed to save sentences: ' + error.message);

      this.elements.saveBtn.disabled = false;
      this.elements.saveBtn.innerHTML = '💾 Save as Flashcards';
    }
  }

  resetForm() {
    this.hideAllSections();
    this.elements.sentenceInput.value = '';
    this.elements.sentenceInput.focus();
    this.processedSentences = null;
    this.elements.offlineBtn.style.display = 'none';
  }

  retryProcessing() {
    if (this.elements.sentenceInput.value.trim()) {
      this.processSentences();
    }
  }

  handleOfflineMode() {
    const text = this.elements.sentenceInput.value.trim();
    if (text) {
      this.processSentencesOffline(text).then(data => {
        this.processedSentences = data;
        this.displayResults(data);
      });
    }
  }

  showLoading(message = 'Processing...', subtext = 'This may take a few seconds') {
    this.hideAllSections();
    this.elements.loadingText.textContent = message;
    this.elements.loadingSubtext.textContent = subtext;
    this.elements.loadingSection.style.display = 'block';
    this.elements.processBtn.disabled = true;
  }

  showError(message) {
    this.hideAllSections();
    document.getElementById('errorText').textContent = message;
    this.elements.errorSection.style.display = 'block';
    this.elements.processBtn.disabled = false;

    // Show offline option if online processing failed
    if (this.isOnline && message.includes('Failed to process')) {
      this.elements.offlineBtn.style.display = 'inline-block';
    }
  }

  hideAllSections() {
    this.elements.loadingSection.style.display = 'none';
    this.elements.resultsSection.style.display = 'none';
    this.elements.errorSection.style.display = 'none';
    this.elements.processBtn.disabled = false;
  }

  handleOnlineStatus(isOnline) {
    this.isOnline = isOnline;

    if (isOnline) {
      this.elements.offlineIndicator.style.display = 'none';
      this.elements.offlineIndicator.textContent = '🌐 Online';
      this.elements.offlineIndicator.classList.add('online');
    } else {
      this.elements.offlineIndicator.style.display = 'block';
      this.elements.offlineIndicator.textContent = '📱 Working Offline';
      this.elements.offlineIndicator.classList.remove('online');
    }

    this.updateUI();
  }

  handleSyncEvent(event, data) {
    switch (event) {
      case 'sync_started':
        this.elements.syncIndicator.style.display = 'block';
        this.elements.syncStatus.textContent = 'Syncing...';
        break;

      case 'sync_completed':
        this.elements.syncIndicator.style.display = 'none';
        this.elements.syncStatus.textContent = 'Synced';
        if (data && data.uploaded > 0) {
          console.log(`Sync completed: ${data.uploaded} cards uploaded`);
        }
        break;

      case 'sync_failed':
        this.elements.syncIndicator.style.display = 'none';
        this.elements.syncStatus.textContent = 'Sync failed';
        console.error('Sync failed:', data);
        break;
    }
  }

  async updateUI() {
    try {
      const stats = await cardDB.getStats();
      this.elements.cardCount.textContent = `${stats.totalCards} cards stored locally`;

      const syncStatus = await syncEngine.getSyncStatus();
      if (syncStatus.unsyncedCount > 0) {
        this.elements.syncStatus.textContent = `${syncStatus.unsyncedCount} unsynced`;
      } else if (syncStatus.lastSync) {
        const timeAgo = this.getTimeAgo(syncStatus.lastSync);
        this.elements.syncStatus.textContent = `Synced ${timeAgo}`;
      } else {
        this.elements.syncStatus.textContent = 'Ready';
      }

    } catch (error) {
      console.error('Failed to update UI:', error);
    }
  }

  getTimeAgo(date) {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.sentenceApp = new SentenceProcessorApp();
});