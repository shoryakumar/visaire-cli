const chalk = require('chalk');
const readline = require('readline');
const Utils = require('./utils');
const Providers = require('./providers');
const SpinnerManager = require('./SpinnerManager');

/**
 * Interactive Session Manager for modern conversational experience
 */
class InteractiveSession {
  constructor(config, provider, apiKey, options = {}) {
    this.config = config;
    this.provider = provider;
    this.apiKey = apiKey;
    this.options = options;
    this.providers = new Providers(config);
    this.conversationHistory = [];
    this.isRunning = false;
    this.rl = null;
    this.spinner = new SpinnerManager();
  }

  /**
   * Start the interactive session
   */
  async start() {
    this.isRunning = true;
    this.setupReadline();
    this.displayWelcome();
    await this.conversationLoop();
  }

  /**
   * Setup readline interface
   */
  setupReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('> ')
    });

    // Handle Ctrl+C gracefully
    this.rl.on('SIGINT', () => {
      this.handleExit();
    });
  }

  /**
   * Display welcome message
   */
  displayWelcome() {
    console.log(chalk.cyan.bold('\n⚒️  Welcome to Visaire Interactive Mode'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white(`🤖 Provider: ${chalk.cyan(this.provider.toUpperCase())}`));
    
    if (this.options.model) {
      console.log(chalk.white(`🧠 Model: ${chalk.cyan(this.options.model)}`));
    }
    
    console.log(chalk.gray('\nType your message and press Enter to chat.'));
    console.log(chalk.gray('Special commands:'));
    console.log(chalk.gray('  /help     - Show help'));
    console.log(chalk.gray('  /clear    - Clear conversation history'));
    console.log(chalk.gray('  /history  - Show conversation history'));
    console.log(chalk.gray('  /switch   - Switch provider'));
    console.log(chalk.gray('  /exit     - Exit interactive mode'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');
  }

  /**
   * Main conversation loop
   */
  async conversationLoop() {
    while (this.isRunning) {
      try {
        const input = await this.getUserInput();
        
        if (!input || input.trim().length === 0) {
          continue;
        }

        const trimmedInput = input.trim();

        // Handle special commands
        if (trimmedInput.startsWith('/')) {
          await this.handleCommand(trimmedInput);
          continue;
        }

        // Process regular prompt
        await this.processPrompt(trimmedInput);
        
      } catch (error) {
        if (error.message === 'INTERRUPTED') {
          this.handleExit();
          break;
        }
        Utils.logError('Error in conversation: ' + error.message);
      }
    }
  }

  /**
   * Get user input with promise
   */
  getUserInput() {
    return new Promise((resolve, reject) => {
      this.rl.question(chalk.cyan('> '), (answer) => {
        resolve(answer);
      });
    });
  }

  /**
   * Handle special commands
   */
  async handleCommand(command) {
    const cmd = command.toLowerCase();

    switch (cmd) {
      case '/help':
        this.showHelp();
        break;
      
      case '/clear':
        this.clearHistory();
        break;
      
      case '/history':
        this.showHistory();
        break;
      
      case '/switch':
        await this.switchProvider();
        break;
      
      case '/exit':
        this.handleExit();
        break;
      
      default:
        Utils.logWarning(`Unknown command: ${command}`);
        Utils.logInfo('Type /help for available commands');
    }
  }

  /**
   * Process a regular prompt
   */
  async processPrompt(prompt) {
    // Add to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: prompt,
      timestamp: new Date()
    });

    // Show modern loading with dynamic messages
    const thinkingMessages = [
      'Thinking',
      'Processing',
      'Analyzing', 
      'Reasoning',
      'Contemplating',
      'Synthesizing'
    ];
    
    const randomMessage = thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)];
    this.spinner.start(randomMessage);

    try {
      // Simulate different thinking phases like modern AI tools
      setTimeout(() => {
        if (this.spinner.isRunning()) {
          this.spinner.updateMessage('Processing');
        }
      }, 1000);

      setTimeout(() => {
        if (this.spinner.isRunning()) {
          this.spinner.updateMessage('Generating');
        }
      }, 2000);

      // Get response from provider
      const response = await this.providers.call(
        this.provider, 
        this.apiKey, 
        prompt, 
        this.options
      );

      // Stop spinner with success
      this.spinner.succeed(`Response generated in ${this.spinner.getElapsedTime()}s`);

      // Add response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });

      // Display response
      this.displayResponse(response);

    } catch (error) {
      // Stop spinner with error
      this.spinner.fail(`Request failed after ${this.spinner.getElapsedTime()}s`);
      
      Utils.logError('Failed to get response: ' + error.message);
      
      // Provide helpful suggestions
      if (error.message.includes('Invalid API key')) {
        Utils.logInfo('Your API key may be invalid or expired');
      } else if (error.message.includes('Rate limit')) {
        Utils.logInfo('You may have hit the API rate limit. Try again in a moment.');
      }
    }
  }

  /**
   * Display AI response with nice formatting
   */
  displayResponse(response) {
    console.log('');
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white(response));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log('');
    console.log(chalk.cyan.bold('📖 Interactive Mode Help'));
    console.log(chalk.gray('─'.repeat(30)));
    console.log(chalk.white('Available commands:'));
    console.log(chalk.gray('  /help     - Show this help message'));
    console.log(chalk.gray('  /clear    - Clear conversation history'));
    console.log(chalk.gray('  /history  - Show conversation history'));
    console.log(chalk.gray('  /switch   - Switch to a different provider'));
    console.log(chalk.gray('  /exit     - Exit interactive mode'));
    console.log('');
    console.log(chalk.white('Tips:'));
    console.log(chalk.gray('  • Type naturally - ask questions, request code, get explanations'));
    console.log(chalk.gray('  • Your conversation history is maintained during the session'));
    console.log(chalk.gray('  • Use Ctrl+C or /exit to quit'));
    console.log('');
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
    console.log('');
    Utils.logSuccess('Conversation history cleared');
    console.log('');
  }

  /**
   * Show conversation history
   */
  showHistory() {
    console.log('');
    console.log(chalk.cyan.bold('📚 Conversation History'));
    console.log(chalk.gray('─'.repeat(30)));
    
    if (this.conversationHistory.length === 0) {
      console.log(chalk.gray('No conversation history yet'));
      console.log('');
      return;
    }

    this.conversationHistory.forEach((entry, index) => {
      const timestamp = entry.timestamp.toLocaleTimeString();
      const role = entry.role === 'user' ? chalk.blue('You') : chalk.green('AI');
      const content = entry.content.length > 100 
        ? entry.content.substring(0, 100) + '...'
        : entry.content;
      
      console.log(`${chalk.gray(timestamp)} ${role}: ${chalk.white(content)}`);
    });
    console.log('');
  }

  /**
   * Switch provider
   */
  async switchProvider() {
    console.log('');
    console.log(chalk.cyan('Available providers:'));
    console.log('1. Claude (Anthropic)');
    console.log('2. GPT (OpenAI)');
    console.log('3. Gemini (Google)');
    console.log('');

    const choice = await this.getUserInput();
    const providers = {
      '1': 'claude',
      '2': 'gpt',
      '3': 'gemini'
    };

    const newProvider = providers[choice.trim()];
    if (newProvider) {
      // Check if API key is available for new provider
      const Config = require('./config');
      const config = new Config();
      const newApiKey = config.getApiKey(newProvider);
      
      if (newApiKey) {
        this.provider = newProvider;
        this.apiKey = newApiKey;
        Utils.logSuccess(`Switched to ${newProvider.toUpperCase()}`);
        
        // Clear history when switching providers
        this.conversationHistory = [];
        Utils.logInfo('Conversation history cleared for new provider');
      } else {
        Utils.logError(`No API key found for ${newProvider}`);
        Utils.logInfo(`Set up ${newProvider} with: visaire config-set --set-api-key <key> --set-provider ${newProvider}`);
      }
    } else {
      Utils.logWarning('Invalid choice. Please select 1, 2, or 3.');
    }
    console.log('');
  }

  /**
   * Handle exit
   */
  handleExit() {
    console.log('');
    Utils.logInfo('Thanks for using Visaire! 👋');
    this.isRunning = false;
    if (this.rl) {
      this.rl.close();
    }
    process.exit(0);
  }

  /**
   * Stop the session
   */
  stop() {
    this.isRunning = false;
    if (this.rl) {
      this.rl.close();
    }
  }
}

module.exports = InteractiveSession;