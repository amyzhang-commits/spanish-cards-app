// Spanish Study Mode App
class StudyApp {
  constructor() {
    this.currentSession = null;
    this.currentCardIndex = 0;
    this.sideStack = [];
    this.reviewingSideStack = false;
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
      this.loadFilterOptions();

      console.log('Study app initialized successfully');

    } catch (error) {
      console.error('App initialization failed:', error);
    }
  }

  initializeUI() {
    // Cache DOM elements
    this.elements = {
      // Sections
      filterSection: document.getElementById('filterSection'),
      studySection: document.getElementById('studySection'),
      completeSection: document.getElementById('completeSection'),

      // Filter elements
      cardTypeRadios: document.querySelectorAll('input[name="cardType"]'),
      regularityRadios: document.querySelectorAll('input[name="regularity"]'),
      verbSelect: document.getElementById('verbSelect'),
      tenseMoodSelect: document.getElementById('tenseMoodSelect'),
      regularityGroup: document.getElementById('regularityGroup'),
      verbGroup: document.getElementById('verbGroup'),
      tenseMoodGroup: document.getElementById('tenseMoodGroup'),

      // Session info
      matchingCount: document.getElementById('matchingCount'),
      startStudyBtn: document.getElementById('startStudyBtn'),

      // Study elements
      currentCard: document.getElementById('currentCard'),
      totalCards: document.getElementById('totalCards'),
      sideStackCount: document.getElementById('sideStackCount'),
      sideStackNumber: document.getElementById('sideStackNumber'),
      flashcard: document.getElementById('flashcard'),
      cardFront: document.getElementById('cardFront'),
      cardBack: document.getElementById('cardBack'),

      // Study controls
      revealBtn: document.getElementById('revealBtn'),
      actionButtons: document.getElementById('actionButtons'),
      sideStackBtn: document.getElementById('sideStackBtn'),
      nextBtn: document.getElementById('nextBtn'),
      endStudyBtn: document.getElementById('endStudyBtn'),

      // Complete section
      sessionSummary: document.getElementById('sessionSummary'),
      sideStackReview: document.getElementById('sideStackReview'),
      finalSideStackCount: document.getElementById('finalSideStackCount'),
      reviewSideStackBtn: document.getElementById('reviewSideStackBtn'),
      newSessionBtn: document.getElementById('newSessionBtn'),
      backToFilterBtn: document.getElementById('backToFilterBtn'),

      // Status indicators
      offlineIndicator: document.getElementById('offlineIndicator'),
      syncIndicator: document.getElementById('syncIndicator'),
      cardCount: document.getElementById('cardCount'),
      syncStatus: document.getElementById('syncStatus')
    };
  }

  setupEventListeners() {
    // Filter change listeners
    this.elements.cardTypeRadios.forEach(radio => {
      radio.addEventListener('change', () => this.handleCardTypeChange());
    });

    this.elements.regularityRadios.forEach(radio => {
      radio.addEventListener('change', () => this.updateMatchingCount());
    });

    this.elements.verbSelect.addEventListener('change', () => this.updateMatchingCount());
    this.elements.tenseMoodSelect.addEventListener('change', () => this.updateMatchingCount());

    // Study session controls
    this.elements.startStudyBtn.addEventListener('click', () => this.startStudySession());
    this.elements.revealBtn.addEventListener('click', () => this.revealAnswer());
    this.elements.sideStackBtn.addEventListener('click', () => this.addToSideStack());
    this.elements.nextBtn.addEventListener('click', () => this.nextCard());
    this.elements.endStudyBtn.addEventListener('click', () => this.endSession());

    // Complete section controls
    this.elements.reviewSideStackBtn.addEventListener('click', () => this.reviewSideStack());
    this.elements.newSessionBtn.addEventListener('click', () => this.startNewSession());
    this.elements.backToFilterBtn.addEventListener('click', () => this.backToFilters());

    // Online/offline events
    window.addEventListener('online', () => this.handleOnlineStatus(true));
    window.addEventListener('offline', () => this.handleOnlineStatus(false));
  }

  async loadFilterOptions() {
    try {
      const filterOptions = await cardDB.getFilterOptions();

      // Populate verb dropdown
      this.elements.verbSelect.innerHTML = '<option value="">All Verbs</option>';
      filterOptions.verbs.forEach(verb => {
        const option = document.createElement('option');
        option.value = verb;
        option.textContent = verb;
        this.elements.verbSelect.appendChild(option);
      });

      // Note: tenseMoodSelect is already populated in HTML with all possible combinations
      // Initial count update
      this.updateMatchingCount();

    } catch (error) {
      console.error('Failed to load filter options:', error);
    }
  }

  formatTenseName(tense) {
    return tense.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  formatMoodName(mood) {
    return mood.charAt(0).toUpperCase() + mood.slice(1);
  }

  handleCardTypeChange() {
    const cardType = this.getSelectedCardType();

    // Show/hide verb-specific filters
    const showVerbFilters = cardType === 'all' || cardType === 'verb';

    this.elements.regularityGroup.style.display = showVerbFilters ? 'block' : 'none';
    this.elements.verbGroup.style.display = showVerbFilters ? 'block' : 'none';
    this.elements.tenseMoodGroup.style.display = showVerbFilters ? 'block' : 'none';

    this.updateMatchingCount();
  }

  getSelectedCardType() {
    return document.querySelector('input[name="cardType"]:checked').value;
  }

  getSelectedRegularity() {
    return document.querySelector('input[name="regularity"]:checked').value;
  }

  async updateMatchingCount() {
    try {
      const filters = this.buildFilters();
      const cards = await cardDB.getCards(filters);

      this.elements.matchingCount.textContent = `${cards.length} cards match your filters`;
      this.elements.startStudyBtn.disabled = cards.length === 0;

    } catch (error) {
      console.error('Failed to update matching count:', error);
      this.elements.matchingCount.textContent = 'Error loading cards';
      this.elements.startStudyBtn.disabled = true;
    }
  }

  buildFilters() {
    const filters = {};

    const cardType = this.getSelectedCardType();
    if (cardType !== 'all') {
      filters.type = cardType;
    }

    if (cardType === 'all' || cardType === 'verb') {
      const regularity = this.getSelectedRegularity();
      if (regularity !== 'all') {
        filters.is_regular = regularity === 'regular';
      }

      const verb = this.elements.verbSelect.value;
      if (verb) {
        filters.verb = verb;
      }

      const tenseMood = this.elements.tenseMoodSelect.value;
      if (tenseMood) {
        // Parse tense_mood format (e.g., "present_indicative")
        const parts = tenseMood.split('_');
        if (parts.length >= 2) {
          const tense = parts.slice(0, -1).join('_');
          const mood = parts[parts.length - 1];
          filters.tense = tense;
          filters.mood = mood;
        }
      }
    }

    return filters;
  }

  async startStudySession() {
    try {
      const filters = this.buildFilters();
      const cards = await cardDB.getCards(filters);

      if (cards.length === 0) {
        alert('No cards match your filters!');
        return;
      }

      // Shuffle cards for varied study experience
      this.currentSession = this.shuffleArray([...cards]);
      this.currentCardIndex = 0;
      this.sideStack = [];
      this.reviewingSideStack = false;

      this.showStudySection();
      this.displayCurrentCard();

    } catch (error) {
      console.error('Failed to start study session:', error);
      alert('Failed to start study session: ' + error.message);
    }
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  showStudySection() {
    this.elements.filterSection.style.display = 'none';
    this.elements.studySection.style.display = 'block';
    this.elements.completeSection.style.display = 'none';
  }

  displayCurrentCard() {
    if (!this.currentSession || this.currentCardIndex >= this.currentSession.length) {
      this.completeSession();
      return;
    }

    const card = this.currentSession[this.currentCardIndex];

    // Update progress
    this.elements.currentCard.textContent = this.currentCardIndex + 1;
    this.elements.totalCards.textContent = this.currentSession.length;

    // Update side stack count
    if (this.sideStack.length > 0) {
      this.elements.sideStackCount.style.display = 'inline';
      this.elements.sideStackNumber.textContent = this.sideStack.length;
    } else {
      this.elements.sideStackCount.style.display = 'none';
    }

    // Display card content
    this.displayCard(card);

    // Reset card state
    this.elements.cardBack.style.display = 'none';
    this.elements.cardFront.style.display = 'block';
    this.elements.revealBtn.style.display = 'block';
    this.elements.actionButtons.style.display = 'none';
  }

  displayCard(card) {
    const frontContent = this.elements.cardFront.querySelector('.card-content');
    const backContent = this.elements.cardBack.querySelector('.card-content');

    if (card.type === 'verb') {
      // Verb conjugation card
      frontContent.innerHTML = `
        <div class="verb-prompt">
          <div class="pronoun">${card.pronoun}</div>
          <div class="verb-infinitive">${card.verb}</div>
          <div class="tense-mood">${this.formatTenseName(card.tense)} ${this.formatMoodName(card.mood)}</div>
        </div>
      `;

      backContent.innerHTML = `
        <div class="verb-answer">
          <div class="conjugated-form">${card.conjugated_form}</div>
        </div>
      `;

    } else if (card.type === 'sentence') {
      // Sentence card - English on front, Spanish on back (more challenging!)
      frontContent.innerHTML = `
        <div class="sentence-prompt">
          <div class="english-translation">${card.english_translation}</div>
        </div>
      `;

      backContent.innerHTML = `
        <div class="sentence-answer">
          <div class="spanish-sentence">${card.spanish_sentence}</div>
          ${card.grammar_notes ? `<div class="grammar-notes">${card.grammar_notes}</div>` : ''}
        </div>
      `;
    }
  }

  revealAnswer() {
    this.elements.cardFront.style.display = 'none';
    this.elements.cardBack.style.display = 'block';
    this.elements.revealBtn.style.display = 'none';
    this.elements.actionButtons.style.display = 'flex';

    // Update side stack button text
    const currentCard = this.currentSession[this.currentCardIndex];
    const isInSideStack = this.sideStack.some(card => card.id === currentCard.id);

    if (isInSideStack) {
      this.elements.sideStackBtn.textContent = '✅ Remove from Side Stack';
      this.elements.sideStackBtn.classList.add('in-side-stack');
    } else {
      this.elements.sideStackBtn.textContent = '📚 Add to Side Stack';
      this.elements.sideStackBtn.classList.remove('in-side-stack');
    }
  }

  addToSideStack() {
    const currentCard = this.currentSession[this.currentCardIndex];
    const existingIndex = this.sideStack.findIndex(card => card.id === currentCard.id);

    if (existingIndex !== -1) {
      // Remove from side stack
      this.sideStack.splice(existingIndex, 1);
      this.elements.sideStackBtn.textContent = '📚 Add to Side Stack';
      this.elements.sideStackBtn.classList.remove('in-side-stack');

      // If we're reviewing side stack and this was the last card, the session might be complete
      if (this.reviewingSideStack && this.sideStack.length === 0) {
        // Will be handled in nextCard() -> displayCurrentCard() -> completeSession()
      }
    } else {
      // Add to side stack
      this.sideStack.push(currentCard);
      this.elements.sideStackBtn.textContent = '✅ Added to Side Stack';
      this.elements.sideStackBtn.classList.add('in-side-stack');
    }
  }

  nextCard() {
    this.currentCardIndex++;
    this.displayCurrentCard();
  }

  completeSession() {
    // If we're reviewing side stack and there are still cards in it, keep cycling
    if (this.reviewingSideStack && this.sideStack.length > 0) {
      // Shuffle the remaining side stack cards and restart
      this.currentSession = this.shuffleArray([...this.sideStack]);
      this.currentCardIndex = 0;
      this.displayCurrentCard();
      return;
    }

    // Session is truly complete
    this.elements.studySection.style.display = 'none';
    this.elements.completeSection.style.display = 'block';

    // Update summary
    if (this.reviewingSideStack) {
      this.elements.sessionSummary.textContent = 'Perfect! You\'ve mastered your side stack! 🎉';
    } else {
      this.elements.sessionSummary.textContent = `You've studied ${this.currentSession.length} cards!`;
    }

    // Show side stack review option
    if (this.sideStack.length > 0 && !this.reviewingSideStack) {
      this.elements.sideStackReview.style.display = 'block';
      this.elements.finalSideStackCount.textContent = this.sideStack.length;
    } else {
      this.elements.sideStackReview.style.display = 'none';
    }
  }

  reviewSideStack() {
    if (this.sideStack.length === 0) {
      alert('No cards in side stack!');
      return;
    }

    this.currentSession = [...this.sideStack];
    this.currentCardIndex = 0;
    this.reviewingSideStack = true;

    this.showStudySection();
    this.displayCurrentCard();
  }

  startNewSession() {
    this.currentSession = null;
    this.currentCardIndex = 0;
    this.sideStack = [];
    this.reviewingSideStack = false;
    this.backToFilters();
  }

  backToFilters() {
    this.elements.filterSection.style.display = 'block';
    this.elements.studySection.style.display = 'none';
    this.elements.completeSection.style.display = 'none';
    this.updateMatchingCount();
  }

  endSession() {
    if (confirm('Are you sure you want to end this study session?')) {
      this.completeSession();
    }
  }

  handleOnlineStatus(isOnline) {
    this.isOnline = isOnline;

    if (isOnline) {
      this.elements.offlineIndicator.style.display = 'none';
    } else {
      this.elements.offlineIndicator.style.display = 'block';
      this.elements.offlineIndicator.textContent = '📱 Working Offline';
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
        break;

      case 'sync_failed':
        this.elements.syncIndicator.style.display = 'none';
        this.elements.syncStatus.textContent = 'Sync failed';
        break;
    }
  }

  async updateUI() {
    try {
      const stats = await cardDB.getStats();
      this.elements.cardCount.textContent = `${stats.totalCards} cards stored locally`;

    } catch (error) {
      console.error('Failed to update UI:', error);
    }
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.studyApp = new StudyApp();
});