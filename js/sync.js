// Sync engine for cross-device synchronization
class SyncEngine {
  constructor() {
    // Enable sync if SYNC_ENDPOINT is configured
    this.syncEndpoint = this.getSyncEndpoint();
    this.syncEnabled = !!this.syncEndpoint;
    this.deviceId = this.getDeviceId();
    this.syncInProgress = false;
    this.syncListeners = [];
  }

  getSyncEndpoint() {
  // Check for custom sync endpoint in localStorage
  const customEndpoint = localStorage.getItem('spanish_cards_sync_endpoint');
  if (customEndpoint) {
    return customEndpoint;
  }

  // Default endpoints
  return window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : 'https://spanish-cards-production.up.railway.app';
}

  getDeviceId() {
    let deviceId = localStorage.getItem('spanish_cards_device_id');
    if (!deviceId) {
      deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('spanish_cards_device_id', deviceId);
    }
    return deviceId;
  }

  // Add sync event listener
  addSyncListener(callback) {
    this.syncListeners.push(callback);
  }

  // Remove sync event listener
  removeSyncListener(callback) {
    this.syncListeners = this.syncListeners.filter(cb => cb !== callback);
  }

  // Notify sync listeners
  notifySyncListeners(event, data) {
    this.syncListeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Sync listener error:', error);
      }
    });
  }

  // Check if online
  isOnline() {
    return navigator.onLine;
  }

  // Attempt to sync cards with server
  async syncCards() {
    // Skip if sync is disabled (no backend server)
    if (!this.syncEnabled) {
      return false;
    }

    if (this.syncInProgress || !this.isOnline()) {
      console.log('Sync skipped: already in progress or offline');
      return false;
    }

    this.syncInProgress = true;
    this.notifySyncListeners('sync_started');

    try {
      console.log('Starting sync process...');

      // Get unsynced local cards
      const unsyncedCards = await cardDB.getUnsyncedCards();

      if (unsyncedCards.length === 0) {
        console.log('No cards to sync');
        this.syncInProgress = false;
        this.notifySyncListeners('sync_completed', { uploaded: 0, downloaded: 0 });
        return true;
      }

      // Upload local changes
      const uploadResult = await this.uploadCards(unsyncedCards);

      if (uploadResult.success) {
        // Mark cards as synced
        const cardIds = unsyncedCards.map(card => card.id);
        await cardDB.markCardsSynced(cardIds);

        // Update last sync timestamp
        await cardDB.setSyncMetadata('last_sync', Date.now());

        console.log(`Sync completed: ${unsyncedCards.length} cards uploaded`);
        this.notifySyncListeners('sync_completed', {
          uploaded: unsyncedCards.length,
          downloaded: 0
        });

        return true;
      } else {
        throw new Error(uploadResult.error || 'Upload failed');
      }

    } catch (error) {
      console.error('Sync failed:', error);
      this.notifySyncListeners('sync_failed', error.message);
      return false;

    } finally {
      this.syncInProgress = false;
    }
  }

  // Upload cards to server
  async uploadCards(cards) {
    try {
      const response = await fetch(`${this.syncEndpoint}/api/cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cards: cards,
          device_id: this.deviceId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return { success: true, result };

    } catch (error) {
      console.error('Upload failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Register for background sync (when available)
  async registerBackgroundSync() {
    // Skip if sync is disabled
    if (!this.syncEnabled) {
      return;
    }

    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-cards');
        console.log('Background sync registered');
      } catch (error) {
        console.log('Background sync registration failed:', error);
      }
    }
  }

  // Auto-sync when coming online
  startAutoSync() {
    // Skip if sync is disabled
    if (!this.syncEnabled) {
      return;
    }

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('Device came online, attempting sync...');
      setTimeout(() => this.syncCards(), 1000); // Delay to ensure connection is stable
    });

    // Periodic sync when online (every 5 minutes)
    setInterval(() => {
      if (this.isOnline() && !this.syncInProgress) {
        this.syncCards();
      }
    }, 5 * 60 * 1000);

    // Initial sync attempt
    if (this.isOnline()) {
      setTimeout(() => this.syncCards(), 2000);
    }
  }

  // Get sync status info
  async getSyncStatus() {
    const lastSync = await cardDB.getSyncMetadata('last_sync');
    const unsyncedCards = await cardDB.getUnsyncedCards();

    return {
      lastSync: lastSync ? new Date(lastSync) : null,
      unsyncedCount: unsyncedCards.length,
      isOnline: this.isOnline(),
      syncInProgress: this.syncInProgress
    };
  }

  // Force sync (for manual sync buttons)
  async forcSync() {
    if (!this.isOnline()) {
      throw new Error('Cannot sync while offline');
    }

    return await this.syncCards();
  }
}

// Export singleton instance
const syncEngine = new SyncEngine();