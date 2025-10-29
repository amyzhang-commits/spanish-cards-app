// IndexedDB wrapper for offline-first Spanish card storage
class CardDatabase {
  constructor() {
    this.dbName = 'SpanishCardsDB';
    this.version = 2;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('Database failed to open');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('Database opened successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        this.db = event.target.result;
        console.log('Database upgrade needed');

        // Cards store - unified storage for all card types
        if (!this.db.objectStoreNames.contains('cards')) {
          const cardsStore = this.db.createObjectStore('cards', {
            keyPath: 'id',
            autoIncrement: false
          });

          // Indexes for efficient querying
          cardsStore.createIndex('type', 'type', { unique: false });
          cardsStore.createIndex('created_at', 'created_at', { unique: false });
          cardsStore.createIndex('modified_at', 'modified_at', { unique: false });
          cardsStore.createIndex('sync_status', 'sync_status', { unique: false });
          cardsStore.createIndex('verb', 'verb', { unique: false });
          cardsStore.createIndex('tense', 'tense', { unique: false });
          cardsStore.createIndex('mood', 'mood', { unique: false });
          cardsStore.createIndex('is_regular', 'is_regular', { unique: false });
          cardsStore.createIndex('tense_mood', ['tense', 'mood'], { unique: false });
          cardsStore.createIndex('set_name', 'set_name', { unique: false });
        }

        // Study sessions store
        if (!this.db.objectStoreNames.contains('study_sessions')) {
          const sessionsStore = this.db.createObjectStore('study_sessions', {
            keyPath: 'id',
            autoIncrement: false
          });

          sessionsStore.createIndex('completed_at', 'completed_at', { unique: false });
          sessionsStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Sync metadata store
        if (!this.db.objectStoreNames.contains('sync_metadata')) {
          const syncStore = this.db.createObjectStore('sync_metadata', {
            keyPath: 'key'
          });
        }

        console.log('Database setup complete');
      };
    });
  }

  // Generate unique ID for cards
  generateId(type = 'card') {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Save verb cards (from targeted tense/mood generation)
  async saveVerbCards(verbData, isRegular) {
    const transaction = this.db.transaction(['cards'], 'readwrite');
    const store = transaction.objectStore('cards');
    const timestamp = Date.now();
    const savedCards = [];

    try {
      for (const conjugation of verbData.conjugations) {
        const card = {
          id: this.generateId('verb'),
          type: 'verb',
          verb: verbData.verb,
          pronoun: conjugation.pronoun,
          tense: conjugation.tense,
          mood: conjugation.mood,
          conjugated_form: conjugation.form,
          is_regular: isRegular,
          created_at: timestamp,
          modified_at: timestamp,
          sync_status: 'local'
        };

        await store.add(card);
        savedCards.push(card);
      }

      await transaction.complete;
      console.log(`Saved ${savedCards.length} ${verbData.verb} cards (${isRegular ? 'regular' : 'irregular'}) for ${verbData.conjugations[0]?.tense} ${verbData.conjugations[0]?.mood}`);
      return savedCards;

    } catch (error) {
      console.error('Error saving verb cards:', error);
      throw error;
    }
  }

  // Save sentence cards (from sentence processing or meaning-only cards)
  async saveSentenceCards(sentences) {
    const transaction = this.db.transaction(['cards'], 'readwrite');
    const store = transaction.objectStore('cards');
    const timestamp = Date.now();
    const savedCards = [];

    try {
      for (const sentence of sentences) {
        const card = {
          id: this.generateId('sentence'),
          type: 'sentence',
          spanish_sentence: sentence.spanish_sentence || sentence.corrected_spanish,
          english_translation: sentence.english_translation,
          grammar_notes: sentence.grammar_notes || sentence.verb_info || '',
          original_sentence: sentence.original_sentence || '',
          set_name: sentence.set_name || '',
          created_at: timestamp,
          modified_at: timestamp,
          sync_status: 'local'
        };

        await store.add(card);
        savedCards.push(card);
      }

      await transaction.complete;
      console.log(`Saved ${savedCards.length} sentence cards`);
      return savedCards;

    } catch (error) {
      console.error('Error saving sentence cards:', error);
      throw error;
    }
  }

  // Get all cards with optional filtering
  async getCards(filters = {}) {
    const transaction = this.db.transaction(['cards'], 'readonly');
    const store = transaction.objectStore('cards');

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        let cards = request.result;

        // Filter out deleted cards (unless explicitly requested)
        if (!filters.includeDeleted) {
          cards = cards.filter(card => !card.deleted);
        }

        // Apply filters
        if (filters.type) {
          cards = cards.filter(card => card.type === filters.type);
        }

        if (filters.verb) {
          cards = cards.filter(card =>
            card.verb && card.verb.toLowerCase().includes(filters.verb.toLowerCase())
          );
        }

        if (filters.tense) {
          cards = cards.filter(card => card.tense === filters.tense);
        }

        if (filters.mood) {
          cards = cards.filter(card => card.mood === filters.mood);
        }

        if (filters.is_regular !== undefined) {
          cards = cards.filter(card => card.is_regular === filters.is_regular);
        }

        if (filters.verbs && Array.isArray(filters.verbs)) {
          cards = cards.filter(card => filters.verbs.includes(card.verb));
        }

        if (filters.set_name) {
          cards = cards.filter(card => card.set_name === filters.set_name);
        }

        // Sort by creation date (newest first)
        cards.sort((a, b) => b.created_at - a.created_at);

        resolve(cards);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // Delete a card (soft delete - mark for sync)
  async deleteCard(cardId) {
    const transaction = this.db.transaction(['cards'], 'readwrite');
    const store = transaction.objectStore('cards');

    try {
      // Get the card first
      const getRequest = store.get(cardId);
      const card = await new Promise((resolve, reject) => {
        getRequest.onsuccess = () => resolve(getRequest.result);
        getRequest.onerror = () => reject(getRequest.error);
      });

      if (card) {
        // Mark as deleted and needs sync
        card.deleted = true;
        card.sync_status = 'local';
        card.modified_at = Date.now();

        const putRequest = store.put(card);
        await new Promise((resolve, reject) => {
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        });

        console.log(`Marked card as deleted: ${cardId}`);
      }

      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      return true;

    } catch (error) {
      console.error('Error deleting card:', error);
      throw error;
    }
  }

  // Hard delete cards marked as deleted (cleanup after sync)
  async cleanupDeletedCards() {
    const transaction = this.db.transaction(['cards'], 'readwrite');
    const store = transaction.objectStore('cards');

    try {
      const getAllRequest = store.getAll();
      const allCards = await new Promise((resolve, reject) => {
        getAllRequest.onsuccess = () => resolve(getAllRequest.result);
        getAllRequest.onerror = () => reject(getAllRequest.error);
      });

      const deletedAndSynced = allCards.filter(card =>
        card.deleted && card.sync_status === 'synced'
      );

      for (const card of deletedAndSynced) {
        await store.delete(card.id);
      }

      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      if (deletedAndSynced.length > 0) {
        console.log(`Cleaned up ${deletedAndSynced.length} synced deletions`);
      }

      return deletedAndSynced.length;

    } catch (error) {
      console.error('Error cleaning up deleted cards:', error);
      throw error;
    }
  }

  // Get cards that need syncing
  async getUnsyncedCards() {
    const transaction = this.db.transaction(['cards'], 'readonly');
    const store = transaction.objectStore('cards');
    const index = store.index('sync_status');

    return new Promise((resolve, reject) => {
      const request = index.getAll('local');

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // Mark cards as synced
  async markCardsSynced(cardIds) {
    const transaction = this.db.transaction(['cards'], 'readwrite');
    const store = transaction.objectStore('cards');
    
    try {
      // Use Promise.all instead of await in a loop
      await Promise.all(cardIds.map(cardId => {
        return new Promise((resolve, reject) => {
          const getRequest = store.get(cardId);
          
          getRequest.onsuccess = () => {
            const card = getRequest.result;
            if (card) {
              card.sync_status = 'synced';
              card.modified_at = Date.now();
              const putRequest = store.put(card);
              putRequest.onsuccess = () => resolve();
              putRequest.onerror = () => reject(putRequest.error);
            } else {
              resolve();
            }
          };
          
          getRequest.onerror = () => reject(getRequest.error);
        });
      }));
      
      // Wait for transaction to complete
      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      
      console.log(`Marked ${cardIds.length} cards as synced`);
    } catch (error) {
      console.error('Error marking cards as synced:', error);
      throw error;
    }
  }

  // Save study session
  async saveStudySession(sessionData) {
    const transaction = this.db.transaction(['study_sessions'], 'readwrite');
    const store = transaction.objectStore('study_sessions');

    const session = {
      id: this.generateId('session'),
      cards_studied: sessionData.cards_studied,
      progress: sessionData.progress,
      completed_at: Date.now(),
      sync_status: 'local'
    };

    try {
      await store.add(session);
      await transaction.complete;
      console.log('Study session saved');
      return session;

    } catch (error) {
      console.error('Error saving study session:', error);
      throw error;
    }
  }

  // Get sync metadata
  async getSyncMetadata(key) {
    const transaction = this.db.transaction(['sync_metadata'], 'readonly');
    const store = transaction.objectStore('sync_metadata');

    return new Promise((resolve, reject) => {
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result?.value || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // Set sync metadata
  async setSyncMetadata(key, value) {
    const transaction = this.db.transaction(['sync_metadata'], 'readwrite');
    const store = transaction.objectStore('sync_metadata');

    try {
      await store.put({ key, value });
      await transaction.complete;

    } catch (error) {
      console.error('Error setting sync metadata:', error);
      throw error;
    }
  }

  // Get database stats
  async getStats() {
    const cards = await this.getCards();
    const verbCards = cards.filter(card => card.type === 'verb');
    const sentenceCards = cards.filter(card => card.type === 'sentence');
    const unsyncedCards = await this.getUnsyncedCards();

    return {
      totalCards: cards.length,
      verbCards: verbCards.length,
      sentenceCards: sentenceCards.length,
      unsyncedCards: unsyncedCards.length,
      regularVerbs: verbCards.filter(card => card.is_regular === true).length,
      irregularVerbs: verbCards.filter(card => card.is_regular === false).length,
      lastModified: Math.max(...cards.map(card => card.modified_at), 0)
    };
  }

  // Get unique values for filtering (useful for study mode)
  async getFilterOptions() {
    const verbCards = await this.getCards({ type: 'verb' });
    const sentenceCards = await this.getCards({ type: 'sentence' });

    const uniqueVerbs = [...new Set(verbCards.map(card => card.verb))].sort();
    const uniqueTenses = [...new Set(verbCards.map(card => card.tense))].filter(Boolean).sort();
    const uniqueMoods = [...new Set(verbCards.map(card => card.mood))].filter(Boolean).sort();
    const uniqueSets = [...new Set(sentenceCards.map(card => card.set_name))].filter(Boolean).sort();

    return {
      verbs: uniqueVerbs,
      tenses: uniqueTenses,
      moods: uniqueMoods,
      tenseMoodCombos: [...new Set(verbCards.map(card => `${card.tense}_${card.mood}`))].filter(combo => !combo.includes('undefined')).sort(),
      sets: uniqueSets
    };
  }

  // Get unique sentence sets
  async getUniqueSets() {
    const sentenceCards = await this.getCards({ type: 'sentence' });
    return [...new Set(sentenceCards.map(card => card.set_name))].filter(Boolean).sort();
  }
}

// Export singleton instance
const cardDB = new CardDatabase();
