const chalk = require('chalk');
const readline = require('readline');
const Utils = require('./utils');
const Providers = require('./providers');
const EnhancedAgent = require('./EnhancedAgent');
const SpinnerManager = require('./SpinnerManager');

/**
 * Interactive Session Manager for modern conversational experience with agentic capabilities
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
    
    // Initialize enhanced agent for agentic capabilities
    this.agent = new EnhancedAgent({
      provider: this.provider,
      apiKey: this.apiKey,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      effort: 'medium',
      autoApprove: true, // Auto-approve tool execution in interactive mode
      confirmationRequired: false, // No confirmation needed for immediate execution
      maxIterations: 5,
      logLevel: 'info',
      enableMetrics: true,
      timeout: config.timeout || 30000
    });
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
    this.rl.on('SIGINT', async () => {
      await this.handleExit();
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
    
    console.log(chalk.green('🚀 Agentic mode enabled - Can create files, run commands, and perform complex tasks'));
    console.log(chalk.yellow('⚡ Persistent session - Use Ctrl+C or /exit to quit'));
    
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
   * Main conversation loop - Persistent session
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
        
        // Continue the loop - stay in interactive mode
        continue;
        
      } catch (error) {
        if (error.message === 'INTERRUPTED' || error.message === 'READLINE_CLOSED') {
          await this.handleExit();
          break;
        }
        Utils.logError('Error in conversation: ' + error.message);
        Utils.logInfo('Session continues - type your next message or /exit to quit');
        // Don't break the loop on errors, just continue
        continue;
      }
    }
  }

  /**
   * Get user input with promise
   */
  getUserInput() {
    return new Promise((resolve, reject) => {
      // Check if readline interface is still open
      if (!this.rl || this.rl.closed) {
        reject(new Error('READLINE_CLOSED'));
        return;
      }

      this.rl.question(chalk.cyan('> '), (answer) => {
        resolve(answer);
      });

      // Handle readline close event
      this.rl.once('close', () => {
        reject(new Error('READLINE_CLOSED'));
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
        await this.handleExit();
        break;
      
      default:
        Utils.logWarning(`Unknown command: ${command}`);
        Utils.logInfo('Type /help for available commands');
    }
  }

  /**
   * Process a regular prompt with enhanced agent capabilities
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
      'Planning actions',
      'Executing tasks'
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
          this.spinner.updateMessage('Executing');
        }
      }, 2000);

      // Use enhanced agent for agentic capabilities
      const result = await this.agent.processPrompt(prompt, {
        effort: 'medium',
        autoApprove: true
      });

      // Stop spinner with success
      this.spinner.succeed(`Response generated in ${this.spinner.getElapsedTime()}s`);

      // Extract response from agent result
      const response = result.response || 'Task completed successfully.';

      // Add response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });

      // Display response and execution summary
      this.displayResponse(response);
      
      // Show execution summary if actions were performed
      if (result.summary && (result.summary.actionsExecuted > 0 || result.summary.filesCreated > 0 || result.summary.commandsRun > 0)) {
        this.displayExecutionSummary(result.summary);
      }

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
   * Display execution summary for agentic actions
   */
  displayExecutionSummary(summary) {
    console.log(chalk.cyan.bold('🔧 Execution Summary:'));
    
    if (summary.actionsExecuted > 0) {
      console.log(chalk.white(`   Actions executed: ${chalk.green(summary.actionsExecuted)}`));
    }
    
    if (summary.filesCreated > 0) {
      console.log(chalk.white(`   Files created: ${chalk.green(summary.filesCreated)}`));
    }
    
    if (summary.filesModified > 0) {
      console.log(chalk.white(`   Files modified: ${chalk.green(summary.filesModified)}`));
    }
    
    if (summary.commandsRun > 0) {
      console.log(chalk.white(`   Commands executed: ${chalk.green(summary.commandsRun)}`));
    }
    
    if (summary.errors > 0) {
      console.log(chalk.white(`   Errors: ${chalk.red(summary.errors)}`));
    }
    
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
    console.log(chalk.gray('  • Ask me to create files, run commands, or analyze code'));
    console.log(chalk.gray('  • I can perform complex multi-step tasks automatically'));
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

    this.conversationHistory.forEach((entry) => {
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
  async handleExit() {
    console.log('');
    Utils.logInfo('Thanks for using Visaire! 👋');
    this.isRunning = false;
    
    // Cleanup agent
    if (this.agent) {
      try {
        await this.agent.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
    
    if (this.rl) {
      this.rl.close();
    }
    process.exit(0);
  }

  /**
   * Stop the session
   */
  async stop() {
    this.isRunning = false;
    
    // Cleanup agent
    if (this.agent) {
      try {
        await this.agent.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
    
    if (this.rl) {
      this.rl.close();
    }
  }
}

module.exports = InteractiveSession;