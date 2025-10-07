// Offline-first Spanish Verb Trainer App
class SpanishVerbApp {
  constructor() {
    this.currentVerbData = null;
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

      // Register background sync
      await syncEngine.registerBackgroundSync();

      console.log('App initialized successfully');

    } catch (error) {
      console.error('App initialization failed:', error);
      this.showError('Failed to initialize app: ' + error.message);
    }
  }

  initializeUI() {
    // Cache DOM elements
    this.elements = {
      // Form elements
      verbForm: document.getElementById('verbForm'),
      verbInput: document.getElementById('verbInput'),
      generateBtn: document.getElementById('generateBtn'),

      // Section elements
      loadingSection: document.getElementById('loadingSection'),
      generationSection: document.getElementById('generationSection'),
      resultsSection: document.getElementById('resultsSection'),
      errorSection: document.getElementById('errorSection'),

      // Generation form elements
      tenseMoodSelect: document.getElementById('tenseMoodSelect'),
      generateCardsBtn: document.getElementById('generateCardsBtn'),

      // Action buttons
      saveBtn: document.getElementById('saveBtn'),
      generateAnotherBtn: document.getElementById('generateAnotherBtn'),
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
    this.elements.verbForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleVerbSubmission();
    });

    // Dropdown change handler
    this.elements.tenseMoodSelect.addEventListener('change', () => {
      const isValid = this.elements.tenseMoodSelect.value !== '';
      this.elements.generateCardsBtn.disabled = !isValid;
    });

    // Generate cards button
    this.elements.generateCardsBtn.addEventListener('click', () => {
      const tenseMood = this.elements.tenseMoodSelect.value;
      if (tenseMood && this.currentVerbData?.verb) {
        this.generateVerbCards(this.currentVerbData.verb, tenseMood);
      }
    });

    // Action buttons
    this.elements.saveBtn.addEventListener('click', () => this.saveCards());
    this.elements.generateAnotherBtn.addEventListener('click', () => this.resetForm());
    this.elements.retryBtn.addEventListener('click', () => this.retryGeneration());
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

  async handleVerbSubmission() {
    const verb = this.elements.verbInput.value.trim().toLowerCase();

    if (!verb) {
      this.showError('Please enter a verb');
      return;
    }

    // Go straight to generation options
    this.currentVerbData = { verb: verb };
    this.displayGenerationOptions(verb);
  }

  displayGenerationOptions(verb) {
    this.hideAllSections();
    document.getElementById('generationTitle').textContent = `Generate Cards: ${verb}`;

    // Reset dropdown and button
    this.elements.tenseMoodSelect.value = '';
    this.elements.generateCardsBtn.disabled = true;

    this.elements.generationSection.style.display = 'block';
  }

  async generateVerbCards(verb, tenseMood) {
    this.showLoading(`Generating ${tenseMood.replace('_', ' ')} cards...`, 'Creating 6 targeted flashcards');

    try {
      let generatedData;
      const isRegular = await this.checkVerbRegularity(verb);

      // Try online generation first if browser is online
      if (this.isOnline && tenseMood !== 'meaning_only') {
        try {
          generatedData = await this.generateTargetedConjugations(verb, tenseMood);
        } catch (ollamaError) {
          // Ollama not available, fall back to offline mode
          console.warn('Ollama not available, using offline generation:', ollamaError.message);
          generatedData = await this.generateOfflineConjugations(verb, tenseMood);
        }
      } else {
        generatedData = await this.generateOfflineConjugations(verb, tenseMood);
      }

      this.currentVerbData = {
        verb: verb,
        ...generatedData,
        isRegular: isRegular,
        tenseMood: tenseMood
      };

      this.displayResults(this.currentVerbData, 'targeted');

    } catch (error) {
      console.error('Generation error:', error);
      this.showError('Failed to generate verb cards: ' + error.message);
    }
  }

  async checkVerbRegularity(verb) {
    const irregularVerbs = [
      'ser', 'estar', 'ir', 'haber', 'tener', 'hacer', 'poder', 'decir', 'querer', 'venir',
      'dar', 'ver', 'saber', 'salir', 'poner', 'traer', 'conocer', 'parecer', 'seguir',
      'comenzar', 'empezar', 'pensar', 'entender', 'perder', 'mostrar', 'encontrar',
      'recordar', 'volver', 'dormir', 'morir', 'servir', 'pedir', 'repetir', 'sentir',
      'mentir', 'preferir', 'divertir', 'sugerir', 'convertir', 'hervir', 'advertir'
    ];

    return !irregularVerbs.includes(verb.toLowerCase());
  }

  async generateTargetedConjugations(verb, tenseMood) {
    const [tense, mood] = this.parseTenseMood(tenseMood);

    let prompt;

    if (tenseMood === 'meaning_only') {
      prompt = `Generate the English translation for the Spanish verb '${verb}'. Return only JSON:
{
  "verb": "${verb}",
  "english_meaning": "translation here"
}`;
    } else {
      prompt = `Generate Spanish verb conjugations for '${verb}' in ${tense} ${mood}.

Return ONLY this JSON format:
{
  "verb": "${verb}",
  "conjugations": [
    {"pronoun": "yo", "tense": "${tense}", "mood": "${mood}", "form": "conjugated_form"},
    {"pronoun": "tú", "tense": "${tense}", "mood": "${mood}", "form": "conjugated_form"},
    {"pronoun": "él/ella/usted", "tense": "${tense}", "mood": "${mood}", "form": "conjugated_form"},
    {"pronoun": "nosotros", "tense": "${tense}", "mood": "${mood}", "form": "conjugated_form"},
    {"pronoun": "vosotros", "tense": "${tense}", "mood": "${mood}", "form": "conjugated_form"},
    {"pronoun": "ellos/ellas/ustedes", "tense": "${tense}", "mood": "${mood}", "form": "conjugated_form"}
  ]
}

Generate exactly 6 conjugations for all pronouns. Use correct ${tense} ${mood} forms. No other text.`;
    }

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

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const generatedText = data.response || '';

    const jsonStart = generatedText.indexOf('{');
    const jsonEnd = generatedText.lastIndexOf('}') + 1;
    const jsonText = generatedText.slice(jsonStart, jsonEnd);

    return JSON.parse(jsonText);
  }

  async generateOfflineConjugations(verb, tenseMood) {
    if (tenseMood === 'meaning_only') {
      return {
        verb: verb,
        english_meaning: 'Translation not available offline'
      };
    }

    const [tense, mood] = this.parseTenseMood(tenseMood);
    const conjugations = this.getBasicTargetedConjugations(verb, tense, mood);

    return {
      verb: verb,
      conjugations: conjugations
    };
  }

  parseTenseMood(tenseMood) {
    const parts = tenseMood.split('_');
    if (parts.length >= 2) {
      const tense = parts.slice(0, -1).join('_');
      const mood = parts[parts.length - 1];
      return [tense, mood];
    }
    return [tenseMood, 'indicative'];
  }

  getBasicTargetedConjugations(verb, tense, mood) {
    const root = verb.slice(0, -2);
    const ending = verb.slice(-2);
    const pronouns = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];

    let endings = [];

    // Present Indicative
    if (tense === 'present' && mood === 'indicative') {
      if (ending === 'ar') {
        endings = ['o', 'as', 'a', 'amos', 'áis', 'an'];
      } else if (ending === 'er') {
        endings = ['o', 'es', 'e', 'emos', 'éis', 'en'];
      } else if (ending === 'ir') {
        endings = ['o', 'es', 'e', 'imos', 'ís', 'en'];
      }
    }
    // Preterite
    else if (tense === 'preterite' && mood === 'indicative') {
      if (ending === 'ar') {
        endings = ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'];
      } else if (ending === 'er' || ending === 'ir') {
        endings = ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'];
      }
    }
    // Imperfect
    else if (tense === 'imperfect' && mood === 'indicative') {
      if (ending === 'ar') {
        endings = ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'];
      } else if (ending === 'er' || ending === 'ir') {
        endings = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];
      }
    }
    // Future
    else if (tense === 'future' && mood === 'indicative') {
      const futureRoot = verb; // Use full infinitive for future
      endings = ['é', 'ás', 'á', 'emos', 'éis', 'án'];
      return pronouns.map((pronoun, i) => ({
        pronoun: pronoun,
        tense: tense,
        mood: mood,
        form: futureRoot + endings[i]
      }));
    }
    // Simple Conditional
    else if (tense === 'simple' && mood === 'conditional') {
      const condRoot = verb; // Use full infinitive
      endings = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];
      return pronouns.map((pronoun, i) => ({
        pronoun: pronoun,
        tense: tense,
        mood: mood,
        form: condRoot + endings[i]
      }));
    }
    // Present Subjunctive
    else if (tense === 'present' && mood === 'subjunctive') {
      if (ending === 'ar') {
        endings = ['e', 'es', 'e', 'emos', 'éis', 'en'];
      } else if (ending === 'er' || ending === 'ir') {
        endings = ['a', 'as', 'a', 'amos', 'áis', 'an'];
      }
    }
    // Imperfect Subjunctive
    else if (tense === 'imperfect' && mood === 'subjunctive') {
      if (ending === 'ar') {
        endings = ['ara', 'aras', 'ara', 'áramos', 'arais', 'aran'];
      } else if (ending === 'er' || ending === 'ir') {
        endings = ['iera', 'ieras', 'iera', 'iéramos', 'ierais', 'ieran'];
      }
    }
    // Affirmative Imperative
    else if (tense === 'affirmative' && mood === 'imperative') {
      if (ending === 'ar') {
        return [
          { pronoun: 'tú', tense: tense, mood: mood, form: root + 'a' },
          { pronoun: 'usted', tense: tense, mood: mood, form: root + 'e' },
          { pronoun: 'nosotros', tense: tense, mood: mood, form: root + 'emos' },
          { pronoun: 'vosotros', tense: tense, mood: mood, form: root + 'ad' },
          { pronoun: 'ustedes', tense: tense, mood: mood, form: root + 'en' }
        ];
      } else if (ending === 'er' || ending === 'ir') {
        const impEnding = ending === 'er' ? 'e' : 'e';
        return [
          { pronoun: 'tú', tense: tense, mood: mood, form: root + impEnding },
          { pronoun: 'usted', tense: tense, mood: mood, form: root + 'a' },
          { pronoun: 'nosotros', tense: tense, mood: mood, form: root + 'amos' },
          { pronoun: 'vosotros', tense: tense, mood: mood, form: root + (ending === 'er' ? 'ed' : 'id') },
          { pronoun: 'ustedes', tense: tense, mood: mood, form: root + 'an' }
        ];
      }
    }
    // Negative Imperative (uses subjunctive forms)
    else if (tense === 'negative' && mood === 'imperative') {
      if (ending === 'ar') {
        return [
          { pronoun: 'tú', tense: tense, mood: mood, form: 'no ' + root + 'es' },
          { pronoun: 'usted', tense: tense, mood: mood, form: 'no ' + root + 'e' },
          { pronoun: 'nosotros', tense: tense, mood: mood, form: 'no ' + root + 'emos' },
          { pronoun: 'vosotros', tense: tense, mood: mood, form: 'no ' + root + 'éis' },
          { pronoun: 'ustedes', tense: tense, mood: mood, form: 'no ' + root + 'en' }
        ];
      } else if (ending === 'er' || ending === 'ir') {
        return [
          { pronoun: 'tú', tense: tense, mood: mood, form: 'no ' + root + 'as' },
          { pronoun: 'usted', tense: tense, mood: mood, form: 'no ' + root + 'a' },
          { pronoun: 'nosotros', tense: tense, mood: mood, form: 'no ' + root + 'amos' },
          { pronoun: 'vosotros', tense: tense, mood: mood, form: 'no ' + root + 'áis' },
          { pronoun: 'ustedes', tense: tense, mood: mood, form: 'no ' + root + 'an' }
        ];
      }
    }
    // Fallback for unsupported tenses
    else {
      endings = ['[offline]', '[offline]', '[offline]', '[offline]', '[offline]', '[offline]'];
    }

    return pronouns.map((pronoun, i) => ({
      pronoun: pronoun,
      tense: tense,
      mood: mood,
      form: root + endings[i]
    }));
  }


  async generateVerb(verb, depth) {
    const depthLabels = {
      'meaning_only': 'meaning card',
      'core': 'core conjugations',
      'full': 'complete conjugations'
    };

    this.showLoading(`Generating ${depthLabels[depth]}...`);

    try {
      let generatedData;

      if (this.isOnline && depth !== 'meaning_only') {
        // Try online generation for conjugations
        generatedData = await this.generateVerbOnline(verb, depth);
      } else {
        // Use offline generation
        generatedData = await this.generateVerbOffline(verb, depth);
      }

      // Merge cached assessment data with generated conjugations
      this.currentVerbData = {
        ...this.currentVerbData, // Keep cached assessment data
        ...generatedData,
        generationType: depth
      };
      this.displayResults(this.currentVerbData, depth);

    } catch (error) {
      console.error('Generation error:', error);
      this.showError('Failed to generate verb content: ' + error.message);
    }
  }

  async generateVerbOnline(verb, depth) {
    let prompt;

    if (depth === 'core') {
      prompt = `Generate CORE Spanish verb conjugations for '${verb}'. Return JSON format:
{
  "verb": "${verb}",
  "conjugations": [
    {"pronoun": "yo", "tense": "present", "mood": "indicative", "form": "conjugated_form"}
  ]
}

Generate these CORE tenses for ALL pronouns (yo, tú, él/ella/usted, nosotros, vosotros, ellos/ellas/ustedes):
- present indicative
- preterite
- imperfect
- future
- present subjunctive
- imperfect subjunctive
- simple conditional
- imperative (tú and usted forms only)

This should generate approximately 20-25 conjugations. Only return valid JSON, no other text.`;
    } else { // full
      prompt = `Generate COMPLETE Spanish verb conjugations for '${verb}'.

CRITICAL REQUIREMENT: Generate exactly 94 conjugations. Count them as you go.

Return ONLY this VALID JSON format (check commas!):
{
  "verb": "${verb}",
  "conjugations": [
    {"pronoun": "yo", "tense": "present", "mood": "indicative", "form": "conjugated_form"},
    {"pronoun": "tú", "tense": "present", "mood": "indicative", "form": "conjugated_form"},
    {"pronoun": "él/ella/usted", "tense": "present", "mood": "indicative", "form": "conjugated_form"}
  ]
}

REQUIRED BREAKDOWN (MUST total 94):

**INDICATIVE MOOD (42 cards - 7 tenses × 6 pronouns):**
1. present (6 cards: yo, tú, él/ella/usted, nosotros, vosotros, ellos/ellas/ustedes)
2. preterite (6 cards)
3. imperfect (6 cards)
4. future (6 cards)
5. present_perfect (6 cards)
6. past_perfect (6 cards)
7. future_perfect (6 cards)

**SUBJUNCTIVE MOOD (30 cards - 5 tenses × 6 pronouns):**
8. present (6 cards) - use "present_subjunctive"
9. imperfect (6 cards) - use "imperfect_subjunctive"
10. future_subjunctive (6 cards)
11. present_perfect (6 cards) - use "present_perfect_subjunctive"
12. past_perfect (6 cards) - use "past_perfect_subjunctive" (hubiera/hubiese sido forms)

**CONDITIONAL MOOD (12 cards - 2 tenses × 6 pronouns):**
13. simple_conditional (6 cards)
14. conditional_perfect (6 cards)

**IMPERATIVE MOOD (10 cards - only tú, usted, nosotros, vosotros, ustedes):**
15. affirmative_imperative (5 cards - NO yo)
16. negative_imperative (5 cards - NO yo)

TOTAL: 42 + 30 + 12 + 10 = 94 cards exactly.

CRITICAL: Ensure valid JSON syntax:
- Put commas between ALL conjugations
- NO trailing comma after the last conjugation
- Proper quotes around all strings
- MUST include past_perfect_subjunctive (hubiera/hubiese sido forms)
- Only return the JSON, no other text.`;
    }

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

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const generatedText = data.response || '';

    // Parse JSON response
    const jsonStart = generatedText.indexOf('{');
    const jsonEnd = generatedText.lastIndexOf('}') + 1;
    const jsonText = generatedText.slice(jsonStart, jsonEnd);

    const parsedData = JSON.parse(jsonText);

    // Add context from the initial assessment (stored from assessVerb)
    return {
      ...parsedData,
      overview: this.currentVerbData?.overview || 'Generated conjugations',
      related_verbs: this.currentVerbData?.related_verbs || [],
      notes: this.currentVerbData?.notes || 'Conjugation set complete'
    };
  }

  async generateVerbOffline(verb, depth) {
    // Basic offline conjugation patterns (simplified)
    const basicConjugations = this.getBasicConjugations(verb, depth);

    return {
      verb: verb,
      overview: `Offline generation for ${verb}`,
      related_verbs: [],
      notes: 'Generated offline with basic patterns',
      conjugations: basicConjugations,
      english_meaning: 'Translation not available offline'
    };
  }

  getBasicConjugations(verb, depth) {
    const root = verb.slice(0, -2); // Remove -ar, -er, -ir
    const ending = verb.slice(-2);
    const pronouns = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];

    let conjugations = [];

    if (depth === 'meaning_only') {
      return []; // No conjugations for meaning-only
    }

    // Basic present indicative patterns
    let presentEndings;
    if (ending === 'ar') {
      presentEndings = ['o', 'as', 'a', 'amos', 'áis', 'an'];
    } else if (ending === 'er') {
      presentEndings = ['o', 'es', 'e', 'emos', 'éis', 'en'];
    } else { // ir
      presentEndings = ['o', 'es', 'e', 'imos', 'ís', 'en'];
    }

    pronouns.forEach((pronoun, i) => {
      conjugations.push({
        pronoun: pronoun,
        tense: 'present',
        mood: 'indicative',
        form: root + presentEndings[i]
      });
    });

    if (depth === 'full') {
      // Add more tenses for full generation (simplified patterns)
      // This is a basic implementation - in a real app you'd want more sophisticated patterns

      // Simple preterite
      let preteriteEndings;
      if (ending === 'ar') {
        preteriteEndings = ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'];
      } else {
        preteriteEndings = ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'];
      }

      pronouns.forEach((pronoun, i) => {
        conjugations.push({
          pronoun: pronoun,
          tense: 'preterite',
          mood: 'indicative',
          form: root + preteriteEndings[i]
        });
      });
    }

    return conjugations;
  }

  displayResults(data, generationType) {
    this.hideAllSections();

    const previewGrid = document.getElementById('previewGrid');
    const cardCount = document.getElementById('generatedCount');

    if (data.tenseMood === 'meaning_only' || generationType === 'meaning_only') {
      // Handle meaning-only cards
      previewGrid.innerHTML = `
        <div class="card-preview meaning-card">
          <div class="card-front">
            <span class="verb-spanish">${data.verb}</span>
          </div>
          <div class="card-back">
            <span class="verb-english">${data.english_meaning || 'Translation not available'}</span>
          </div>
        </div>
      `;
      cardCount.textContent = '1 meaning card generated';

    } else {
      // Handle conjugation cards
      if (data.conjugations && data.conjugations.length > 0) {
        previewGrid.innerHTML = data.conjugations
          .map(conjugation => this.createCardPreview(conjugation))
          .join('');

        let typeLabel;
        if (generationType === 'targeted') {
          const tenseMoodDisplay = data.tenseMood ? data.tenseMood.replace('_', ' ') : 'targeted';
          typeLabel = `${tenseMoodDisplay} cards`;
        } else {
          typeLabel = generationType === 'core' ? 'core' : 'complete';
        }

        cardCount.textContent = `${data.conjugations.length} ${typeLabel} generated`;
      } else {
        previewGrid.innerHTML = '<p class="no-cards">No conjugations generated</p>';
        cardCount.textContent = '0 cards generated';
      }
    }

    this.elements.resultsSection.style.display = 'block';
  }

  createCardPreview(conjugation) {
    return `
      <div class="card-preview">
        <div class="card-front">
          <div class="card-prompt">
            <span class="pronoun">${conjugation.pronoun}</span>
            <span class="verb">${this.currentVerbData.verb}</span>
            <span class="tense-mood">${conjugation.tense} ${conjugation.mood}</span>
          </div>
        </div>
        <div class="card-back">
          <span class="conjugated-form">${conjugation.form}</span>
        </div>
      </div>
    `;
  }

  async saveCards() {
    if (!this.currentVerbData || (!this.currentVerbData.conjugations && !this.currentVerbData.english_meaning)) {
      this.showError('No cards to save');
      return;
    }

    this.elements.saveBtn.disabled = true;
    this.elements.saveBtn.innerHTML = '💾 Saving...';

    try {
      let savedCards;

      if (this.currentVerbData.tenseMood === 'meaning_only' || this.currentVerbData.generationType === 'meaning_only') {
        // Save as sentence card
        const sentenceData = [{
          spanish_sentence: this.currentVerbData.verb,
          english_translation: this.currentVerbData.english_meaning || 'Translation not available',
          grammar_notes: `Meaning card generated ${this.isOnline ? 'online' : 'offline'}`
        }];
        savedCards = await cardDB.saveSentenceCards(sentenceData);
      } else {
        // Save as verb cards with regularity information
        const isRegular = this.currentVerbData.isRegular !== undefined ? this.currentVerbData.isRegular : true;
        savedCards = await cardDB.saveVerbCards(this.currentVerbData, isRegular);
      }

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
        this.elements.saveBtn.innerHTML = '💾 Save Cards Locally';
        this.elements.saveBtn.classList.remove('success');
      }, 2000);

    } catch (error) {
      console.error('Save error:', error);
      this.showError('Failed to save cards: ' + error.message);

      this.elements.saveBtn.disabled = false;
      this.elements.saveBtn.innerHTML = '💾 Save Cards Locally';
    }
  }

  resetForm() {
    this.hideAllSections();
    this.elements.verbInput.value = '';
    this.elements.verbInput.focus();
    this.currentVerbData = null;
    this.elements.offlineBtn.style.display = 'none';
  }

  retryGeneration() {
    if (this.currentVerbData?.verb) {
      this.displayGenerationOptions(this.currentVerbData.verb);
    }
  }

  handleOfflineMode() {
    const verb = this.currentVerbData?.verb;
    if (verb) {
      this.generateVerb(verb, 'core');
    }
  }

  showLoading(message = 'Processing...', subtext = 'This may take 10-30 seconds') {
    this.hideAllSections();
    this.elements.loadingText.textContent = message;
    this.elements.loadingSubtext.textContent = subtext;
    this.elements.loadingSection.style.display = 'block';
    this.elements.generateBtn.disabled = true;
  }

  showError(message) {
    this.hideAllSections();
    document.getElementById('errorText').textContent = message;
    this.elements.errorSection.style.display = 'block';
    this.elements.generateBtn.disabled = false;
  }

  hideAllSections() {
    this.elements.loadingSection.style.display = 'none';
    this.elements.generationSection.style.display = 'none';
    this.elements.resultsSection.style.display = 'none';
    this.elements.errorSection.style.display = 'none';
    this.elements.generateBtn.disabled = false;
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
  window.app = new SpanishVerbApp();
});