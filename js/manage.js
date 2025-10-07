// Card Management App
class ManageCardsApp {
  constructor() {
    this.allCards = [];
    this.filteredCards = [];
    this.selectedCards = new Set();
    this.duplicateGroups = [];
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
      this.loadCards();
      this.updateStats();

      console.log('Manage cards app initialized successfully');

    } catch (error) {
      console.error('App initialization failed:', error);
    }
  }

  initializeUI() {
    // Cache DOM elements
    this.elements = {
      // Stats
      totalCards: document.getElementById('totalCards'),
      verbCards: document.getElementById('verbCards'),
      sentenceCards: document.getElementById('sentenceCards'),
      unsyncedCards: document.getElementById('unsyncedCards'),
      duplicatesCard: document.getElementById('duplicatesCard'),
      duplicateCards: document.getElementById('duplicateCards'),

      // Quick actions
      findDuplicatesBtn: document.getElementById('findDuplicatesBtn'),
      exportBtn: document.getElementById('exportBtn'),
      clearAllBtn: document.getElementById('clearAllBtn'),

      // Filters
      searchInput: document.getElementById('searchInput'),
      typeFilter: document.getElementById('typeFilter'),
      regularityFilter: document.getElementById('regularityFilter'),
      tenseMoodFilter: document.getElementById('tenseMoodFilter'),
      syncFilter: document.getElementById('syncFilter'),

      // Results
      filteredCount: document.getElementById('filteredCount'),
      bulkActions: document.getElementById('bulkActions'),
      selectAllBtn: document.getElementById('selectAllBtn'),
      deleteSelectedBtn: document.getElementById('deleteSelectedBtn'),
      selectedCount: document.getElementById('selectedCount'),

      // Cards grid
      cardsGrid: document.getElementById('cardsGrid'),
      loadingCards: document.getElementById('loadingCards'),
      noCards: document.getElementById('noCards'),

      // Duplicates modal
      duplicatesModal: document.getElementById('duplicatesModal'),
      closeDuplicatesModal: document.getElementById('closeDuplicatesModal'),
      duplicateCount: document.getElementById('duplicateCount'),
      duplicatesList: document.getElementById('duplicatesList'),
      deleteAllDuplicatesBtn: document.getElementById('deleteAllDuplicatesBtn'),
      cancelDuplicatesBtn: document.getElementById('cancelDuplicatesBtn'),

      // Status indicators
      offlineIndicator: document.getElementById('offlineIndicator'),
      syncIndicator: document.getElementById('syncIndicator'),
      cardCount: document.getElementById('cardCount'),
      syncStatus: document.getElementById('syncStatus')
    };
  }

  setupEventListeners() {
    // Quick actions
    this.elements.findDuplicatesBtn.addEventListener('click', () => this.findDuplicates());
    this.elements.exportBtn.addEventListener('click', () => this.exportCards());
    this.elements.clearAllBtn.addEventListener('click', () => this.clearAllCards());

    // Filters
    this.elements.searchInput.addEventListener('input', () => this.applyFilters());
    this.elements.typeFilter.addEventListener('change', () => this.applyFilters());
    this.elements.regularityFilter.addEventListener('change', () => this.applyFilters());
    this.elements.tenseMoodFilter.addEventListener('change', () => this.applyFilters());
    this.elements.syncFilter.addEventListener('change', () => this.applyFilters());

    // Bulk actions
    this.elements.selectAllBtn.addEventListener('click', () => this.selectAll());
    this.elements.deleteSelectedBtn.addEventListener('click', () => this.deleteSelected());

    // Duplicates modal
    this.elements.closeDuplicatesModal.addEventListener('click', () => this.closeDuplicatesModal());
    this.elements.deleteAllDuplicatesBtn.addEventListener('click', () => this.deleteAllDuplicates());
    this.elements.cancelDuplicatesBtn.addEventListener('click', () => this.closeDuplicatesModal());

    // Online/offline events
    window.addEventListener('online', () => this.handleOnlineStatus(true));
    window.addEventListener('offline', () => this.handleOnlineStatus(false));
  }

  async loadCards() {
    this.elements.loadingCards.style.display = 'block';
    this.elements.cardsGrid.style.display = 'none';
    this.elements.noCards.style.display = 'none';

    try {
      this.allCards = await cardDB.getCards();
      this.applyFilters();
      this.updateStats();
    } catch (error) {
      console.error('Failed to load cards:', error);
    }

    this.elements.loadingCards.style.display = 'none';
  }

  async updateStats() {
    try {
      const stats = await cardDB.getStats();

      this.elements.totalCards.textContent = stats.totalCards;
      this.elements.verbCards.textContent = stats.verbCards;
      this.elements.sentenceCards.textContent = stats.sentenceCards;
      this.elements.unsyncedCards.textContent = stats.unsyncedCards;

      // Update global card count
      this.elements.cardCount.textContent = `${stats.totalCards} cards stored locally`;

    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  }

  applyFilters() {
    const searchTerm = this.elements.searchInput.value.toLowerCase();
    const typeFilter = this.elements.typeFilter.value;
    const regularityFilter = this.elements.regularityFilter.value;
    const tenseMoodFilter = this.elements.tenseMoodFilter.value;
    const syncFilter = this.elements.syncFilter.value;

    this.filteredCards = this.allCards.filter(card => {
      // Search filter
      if (searchTerm) {
        const searchFields = [
          card.verb || '',
          card.conjugated_form || '',
          card.spanish_sentence || '',
          card.english_translation || '',
          card.grammar_notes || ''
        ].join(' ').toLowerCase();

        if (!searchFields.includes(searchTerm)) {
          return false;
        }
      }

      // Type filter
      if (typeFilter && card.type !== typeFilter) {
        return false;
      }

      // Regularity filter (only for verb cards)
      if (regularityFilter && card.type === 'verb') {
        const isRegular = regularityFilter === 'regular';
        if (card.is_regular !== isRegular) {
          return false;
        }
      }

      // Tense/mood filter (only for verb cards)
      if (tenseMoodFilter && card.type === 'verb') {
        const parts = tenseMoodFilter.split('_');
        if (parts.length >= 2) {
          const tense = parts.slice(0, -1).join('_');
          const mood = parts[parts.length - 1];
          if (card.tense !== tense || card.mood !== mood) {
            return false;
          }
        }
      }

      // Sync filter
      if (syncFilter) {
        if (syncFilter === 'local' && card.sync_status !== 'local') {
          return false;
        }
        if (syncFilter === 'synced' && card.sync_status !== 'synced') {
          return false;
        }
      }

      return true;
    });

    this.displayCards();
    this.updateFilteredCount();
  }

  displayCards() {
    if (this.filteredCards.length === 0) {
      this.elements.cardsGrid.style.display = 'none';
      this.elements.noCards.style.display = 'block';
      return;
    }

    this.elements.cardsGrid.style.display = 'grid';
    this.elements.noCards.style.display = 'none';

    this.elements.cardsGrid.innerHTML = this.filteredCards
      .map(card => this.createCardElement(card))
      .join('');

    // Add event listeners to card elements
    this.setupCardEventListeners();
  }

  createCardElement(card) {
    const isSelected = this.selectedCards.has(card.id);
    const syncIcon = card.sync_status === 'synced' ? '✅' : '📱';

    if (card.type === 'verb') {
      return `
        <div class="card-item ${isSelected ? 'selected' : ''}" data-card-id="${card.id}">
          <div class="card-header">
            <input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''}>
            <span class="card-type">🔤 Verb</span>
            <span class="sync-status">${syncIcon}</span>
          </div>
          <div class="card-content">
            <div class="card-main">
              <span class="pronoun">${card.pronoun}</span>
              <span class="verb">${card.verb}</span>
              <span class="arrow">→</span>
              <span class="conjugated">${card.conjugated_form}</span>
            </div>
            <div class="card-meta">
              <span class="tense-mood">${this.formatTenseMood(card.tense, card.mood)}</span>
              <span class="regularity ${card.is_regular ? 'regular' : 'irregular'}">
                ${card.is_regular ? 'Regular' : 'Irregular'}
              </span>
            </div>
          </div>
          <div class="card-actions">
            <button class="btn-edit" data-action="edit">✏️</button>
            <button class="btn-delete" data-action="delete">🗑️</button>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="card-item ${isSelected ? 'selected' : ''}" data-card-id="${card.id}">
          <div class="card-header">
            <input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''}>
            <span class="card-type">💬 Sentence</span>
            <span class="sync-status">${syncIcon}</span>
          </div>
          <div class="card-content">
            <div class="card-main">
              <div class="spanish">${card.spanish_sentence}</div>
              <div class="english">${card.english_translation}</div>
            </div>
            ${card.grammar_notes ? `<div class="card-meta">
              <span class="grammar-notes">${card.grammar_notes}</span>
            </div>` : ''}
          </div>
          <div class="card-actions">
            <button class="btn-edit" data-action="edit">✏️</button>
            <button class="btn-delete" data-action="delete">🗑️</button>
          </div>
        </div>
      `;
    }
  }

  formatTenseMood(tense, mood) {
    const formattedTense = tense.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    const formattedMood = mood.charAt(0).toUpperCase() + mood.slice(1);
    return `${formattedTense} ${formattedMood}`;
  }

  setupCardEventListeners() {
    // Checkbox listeners
    this.elements.cardsGrid.querySelectorAll('.card-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const cardId = e.target.closest('.card-item').dataset.cardId;
        this.toggleCardSelection(cardId, e.target.checked);
      });
    });

    // Action button listeners
    this.elements.cardsGrid.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const cardId = e.target.closest('.card-item').dataset.cardId;
        this.handleCardAction(action, cardId);
      });
    });
  }

  toggleCardSelection(cardId, selected) {
    if (selected) {
      this.selectedCards.add(cardId);
    } else {
      this.selectedCards.delete(cardId);
    }

    this.updateBulkActionsVisibility();
    this.updateSelectedCount();
  }

  updateBulkActionsVisibility() {
    const hasSelection = this.selectedCards.size > 0;
    this.elements.bulkActions.style.display = hasSelection ? 'flex' : 'none';
  }

  updateSelectedCount() {
    this.elements.selectedCount.textContent = `${this.selectedCards.size} selected`;
  }

  updateFilteredCount() {
    this.elements.filteredCount.textContent = `${this.filteredCards.length} cards found`;
  }

  selectAll() {
    this.filteredCards.forEach(card => {
      this.selectedCards.add(card.id);
    });

    // Update UI
    this.elements.cardsGrid.querySelectorAll('.card-checkbox').forEach(checkbox => {
      checkbox.checked = true;
    });

    this.elements.cardsGrid.querySelectorAll('.card-item').forEach(item => {
      item.classList.add('selected');
    });

    this.updateBulkActionsVisibility();
    this.updateSelectedCount();
  }

  async handleCardAction(action, cardId) {
    const card = this.allCards.find(c => c.id === cardId);
    if (!card) return;

    if (action === 'delete') {
      if (confirm(`Delete this ${card.type} card?`)) {
        await this.deleteCard(cardId);
      }
    } else if (action === 'edit') {
      this.editCard(cardId);
    }
  }

  async deleteCard(cardId) {
    try {
      await cardDB.deleteCard(cardId);
      this.allCards = this.allCards.filter(card => card.id !== cardId);
      this.selectedCards.delete(cardId);
      this.applyFilters();
      this.updateStats();
      this.updateBulkActionsVisibility();
      this.updateSelectedCount();
    } catch (error) {
      console.error('Failed to delete card:', error);
      alert('Failed to delete card: ' + error.message);
    }
  }

  async deleteSelected() {
    if (this.selectedCards.size === 0) return;

    if (confirm(`Delete ${this.selectedCards.size} selected cards?`)) {
      try {
        for (const cardId of this.selectedCards) {
          await cardDB.deleteCard(cardId);
        }

        this.allCards = this.allCards.filter(card => !this.selectedCards.has(card.id));
        this.selectedCards.clear();
        this.applyFilters();
        this.updateStats();
        this.updateBulkActionsVisibility();
        this.updateSelectedCount();
      } catch (error) {
        console.error('Failed to delete cards:', error);
        alert('Failed to delete some cards: ' + error.message);
      }
    }
  }

  editCard(cardId) {
    const card = this.allCards.find(c => c.id === cardId);
    if (!card) return;

    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
    if (!cardElement) return;

    // Toggle edit mode
    if (cardElement.classList.contains('editing')) {
      this.cancelEdit(cardId);
    } else {
      this.startEdit(cardId);
    }
  }

  startEdit(cardId) {
    const card = this.allCards.find(c => c.id === cardId);
    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);

    cardElement.classList.add('editing');

    const cardContent = cardElement.querySelector('.card-content');

    if (card.type === 'verb') {
      cardContent.innerHTML = `
        <div class="edit-form">
          <div class="edit-row">
            <label>Pronoun:</label>
            <input type="text" class="edit-pronoun" value="${card.pronoun}">
          </div>
          <div class="edit-row">
            <label>Verb:</label>
            <input type="text" class="edit-verb" value="${card.verb}">
          </div>
          <div class="edit-row">
            <label>Conjugated Form:</label>
            <input type="text" class="edit-conjugated" value="${card.conjugated_form}">
          </div>
          <div class="edit-row">
            <label>Tense:</label>
            <input type="text" class="edit-tense" value="${card.tense}">
          </div>
          <div class="edit-row">
            <label>Mood:</label>
            <input type="text" class="edit-mood" value="${card.mood}">
          </div>
          <div class="edit-row">
            <label>Regular:</label>
            <select class="edit-regular">
              <option value="true" ${card.is_regular ? 'selected' : ''}>Regular</option>
              <option value="false" ${!card.is_regular ? 'selected' : ''}>Irregular</option>
            </select>
          </div>
        </div>
      `;
    } else {
      cardContent.innerHTML = `
        <div class="edit-form">
          <div class="edit-row">
            <label>Spanish Sentence:</label>
            <textarea class="edit-spanish" rows="2">${card.spanish_sentence}</textarea>
          </div>
          <div class="edit-row">
            <label>English Translation:</label>
            <textarea class="edit-english" rows="2">${card.english_translation}</textarea>
          </div>
          <div class="edit-row">
            <label>Grammar Notes:</label>
            <textarea class="edit-notes" rows="2">${card.grammar_notes || ''}</textarea>
          </div>
        </div>
      `;
    }

    // Update action buttons
    const cardActions = cardElement.querySelector('.card-actions');
    cardActions.innerHTML = `
      <button class="btn-save" data-action="save">💾 Save</button>
      <button class="btn-cancel" data-action="cancel">❌ Cancel</button>
    `;

    // Add event listeners to new buttons
    cardActions.querySelector('[data-action="save"]').addEventListener('click', () => this.saveEdit(cardId));
    cardActions.querySelector('[data-action="cancel"]').addEventListener('click', () => this.cancelEdit(cardId));
  }

  async saveEdit(cardId) {
    const card = this.allCards.find(c => c.id === cardId);
    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);

    try {
      // Get edited values
      const editedCard = { ...card };

      if (card.type === 'verb') {
        editedCard.pronoun = cardElement.querySelector('.edit-pronoun').value.trim();
        editedCard.verb = cardElement.querySelector('.edit-verb').value.trim();
        editedCard.conjugated_form = cardElement.querySelector('.edit-conjugated').value.trim();
        editedCard.tense = cardElement.querySelector('.edit-tense').value.trim();
        editedCard.mood = cardElement.querySelector('.edit-mood').value.trim();
        editedCard.is_regular = cardElement.querySelector('.edit-regular').value === 'true';
      } else {
        editedCard.spanish_sentence = cardElement.querySelector('.edit-spanish').value.trim();
        editedCard.english_translation = cardElement.querySelector('.edit-english').value.trim();
        editedCard.grammar_notes = cardElement.querySelector('.edit-notes').value.trim();
      }

      // Validate required fields
      if (card.type === 'verb') {
        if (!editedCard.pronoun || !editedCard.verb || !editedCard.conjugated_form || !editedCard.tense || !editedCard.mood) {
          alert('Please fill in all required fields for verb cards.');
          return;
        }
      } else {
        if (!editedCard.spanish_sentence || !editedCard.english_translation) {
          alert('Please fill in both Spanish sentence and English translation.');
          return;
        }
      }

      // Update timestamp
      editedCard.modified_at = Date.now();
      editedCard.sync_status = 'local'; // Mark as needing sync

      // Save to database
      await this.updateCardInDatabase(editedCard);

      // Update local data
      const cardIndex = this.allCards.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        this.allCards[cardIndex] = editedCard;
      }

      // Exit edit mode and refresh display
      this.cancelEdit(cardId);
      this.applyFilters(); // Refresh the display
      this.updateStats();

      // Show success feedback
      this.showEditSuccess(cardElement);

    } catch (error) {
      console.error('Failed to save card edit:', error);
      alert('Failed to save changes: ' + error.message);
    }
  }

  async updateCardInDatabase(card) {
    // Since IndexedDB doesn't have a direct update method in our wrapper,
    // we need to delete and re-add the card
    const transaction = cardDB.db.transaction(['cards'], 'readwrite');
    const store = transaction.objectStore('cards');

    // Update the existing card
    await store.put(card);
    await transaction.complete;
  }

  cancelEdit(cardId) {
    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
    cardElement.classList.remove('editing');

    // Re-render the card in view mode
    const card = this.allCards.find(c => c.id === cardId);
    const newCardHtml = this.createCardElement(card);
    cardElement.outerHTML = newCardHtml;

    // Re-attach event listeners
    this.setupCardEventListeners();
  }

  showEditSuccess(cardElement) {
    // Add a temporary success indicator
    cardElement.classList.add('edit-success');
    setTimeout(() => {
      cardElement.classList.remove('edit-success');
    }, 2000);
  }

  async findDuplicates() {
    this.duplicateGroups = this.detectDuplicates();

    if (this.duplicateGroups.length === 0) {
      alert('No duplicates found! 🎉');
      this.elements.duplicatesCard.style.display = 'none';
      return;
    }

    // Show duplicates count in dashboard
    const totalDuplicates = this.duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);
    this.elements.duplicateCards.textContent = totalDuplicates;
    this.elements.duplicatesCard.style.display = 'block';

    // Show duplicates modal
    this.showDuplicatesModal();
  }

  detectDuplicates() {
    const groups = new Map();

    this.allCards.forEach(card => {
      let key;

      if (card.type === 'verb') {
        // For verb cards: verb + pronoun + tense + mood
        key = `${card.verb}_${card.pronoun}_${card.tense}_${card.mood}`;
      } else {
        // For sentence cards: spanish sentence (normalized)
        key = card.spanish_sentence.toLowerCase().trim();
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(card);
    });

    // Return only groups with duplicates
    return Array.from(groups.values()).filter(group => group.length > 1);
  }

  showDuplicatesModal() {
    const totalDuplicates = this.duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);
    this.elements.duplicateCount.textContent = totalDuplicates;

    this.elements.duplicatesList.innerHTML = this.duplicateGroups
      .map(group => this.createDuplicateGroupElement(group))
      .join('');

    this.elements.duplicatesModal.style.display = 'flex';
  }

  createDuplicateGroupElement(group) {
    const sample = group[0];
    const title = sample.type === 'verb'
      ? `${sample.pronoun} ${sample.verb} (${sample.tense} ${sample.mood})`
      : sample.spanish_sentence;

    return `
      <div class="duplicate-group">
        <h4>${title}</h4>
        <p>Found ${group.length} copies:</p>
        <div class="duplicate-items">
          ${group.map((card, index) => `
            <div class="duplicate-item">
              <span class="duplicate-info">
                Created: ${new Date(card.created_at).toLocaleDateString()}
                ${card.sync_status === 'synced' ? '✅ Synced' : '📱 Local'}
              </span>
              ${index > 0 ? '<button class="btn-delete-duplicate" data-duplicate-id="' + card.id + '">🗑️ Delete</button>' : '<span class="keep-label">📌 Keep</span>'}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  closeDuplicatesModal() {
    this.elements.duplicatesModal.style.display = 'none';
  }

  async deleteAllDuplicates() {
    if (confirm('Delete all duplicate cards? This will keep the oldest copy of each duplicate.')) {
      try {
        const cardsToDelete = [];

        this.duplicateGroups.forEach(group => {
          // Keep the first (oldest) card, delete the rest
          group.slice(1).forEach(card => {
            cardsToDelete.push(card.id);
          });
        });

        for (const cardId of cardsToDelete) {
          await cardDB.deleteCard(cardId);
        }

        this.allCards = this.allCards.filter(card => !cardsToDelete.includes(card.id));
        this.selectedCards.clear();

        this.closeDuplicatesModal();
        this.elements.duplicatesCard.style.display = 'none';
        this.applyFilters();
        this.updateStats();

        alert(`Deleted ${cardsToDelete.length} duplicate cards! 🎉`);

      } catch (error) {
        console.error('Failed to delete duplicates:', error);
        alert('Failed to delete some duplicates: ' + error.message);
      }
    }
  }

  async exportCards() {
    try {
      const cardsToExport = this.selectedCards.size > 0
        ? this.allCards.filter(card => this.selectedCards.has(card.id))
        : this.allCards;

      const exportData = {
        exported_at: new Date().toISOString(),
        total_cards: cardsToExport.length,
        cards: cardsToExport
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `spanish-cards-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);

      alert(`Exported ${cardsToExport.length} cards! 📤`);

    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
    }
  }

  async clearAllCards() {
    if (confirm('⚠️ Delete ALL cards? This cannot be undone!')) {
      if (confirm('Are you absolutely sure? This will delete all your cards permanently!')) {
        try {
          for (const card of this.allCards) {
            await cardDB.deleteCard(card.id);
          }

          this.allCards = [];
          this.selectedCards.clear();
          this.applyFilters();
          this.updateStats();

          alert('All cards deleted! 🗑️');

        } catch (error) {
          console.error('Failed to clear all cards:', error);
          alert('Failed to delete some cards: ' + error.message);
        }
      }
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
        // Reload cards to get updated sync status
        this.loadCards();
        break;

      case 'sync_failed':
        this.elements.syncIndicator.style.display = 'none';
        this.elements.syncStatus.textContent = 'Sync failed';
        break;
    }
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.manageApp = new ManageCardsApp();
});