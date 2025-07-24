const Utils = require('./utils');
const Config = require('./config');

/**
 * Interactive setup for first-time users
 */
class Setup {
  constructor() {
    this.config = new Config();
  }

  /**
   * Run interactive setup
   */
  async run() {
    Utils.logInfo('🚀 Welcome to Visaire CLI Setup!');
    console.log('');
    Utils.logInfo('This setup will help you configure Visaire for first use.');
    Utils.logInfo('You can always change these settings later using: visaire config set');
    console.log('');

    // Check if config already exists
    if (this.config.exists()) {
      Utils.logWarning('Configuration file already exists at: ' + this.config.getConfigPath());
      console.log('');
      
      const shouldContinue = await this.askYesNo('Do you want to update your existing configuration?');
      if (!shouldContinue) {
        Utils.logInfo('Setup cancelled. Your existing configuration is unchanged.');
        return;
      }
      console.log('');
    }

    try {
      // Step 1: Choose default provider
      const provider = await this.chooseProvider();
      
      // Step 2: Set API key for chosen provider
      const apiKey = await this.getApiKey(provider);
      
      // Step 3: Choose default model (optional)
      const model = await this.chooseModel(provider);
      
      // Step 4: Agent settings
      const agentEnabled = await this.configureAgent();

      // Step 5: Save configuration
      const settings = {
        defaultProvider: provider
      };

      if (model) {
        settings.defaultModel = model;
      }

      if (agentEnabled !== undefined) {
        settings['agent.enabled'] = agentEnabled;
      }

      // Save settings
      if (this.config.setMultiple(settings)) {
        // Save API key
        if (this.config.setApiKey(provider, apiKey)) {
          console.log('');
          Utils.logSuccess('🎉 Setup completed successfully!');
          console.log('');
          this.showQuickStart(provider);
        } else {
          Utils.logError('Failed to save API key');
        }
      } else {
        Utils.logError('Failed to save configuration');
      }

    } catch (error) {
      Utils.logError('Setup failed: ' + error.message);
      process.exit(1);
    }
  }

  /**
   * Choose default provider
   */
  async chooseProvider() {
    Utils.logInfo('📡 Choose your default AI provider:');
    console.log('');
    console.log('1. Claude (Anthropic) - Great for reasoning and analysis');
    console.log('2. GPT (OpenAI) - Popular choice with good general capabilities');
    console.log('3. Gemini (Google) - Fast and efficient for most tasks');
    console.log('');

    const choice = await this.askChoice('Enter your choice (1-3)', ['1', '2', '3']);
    
    const providers = {
      '1': 'claude',
      '2': 'gpt', 
      '3': 'gemini'
    };

    return providers[choice];
  }

  /**
   * Get API key for provider
   */
  async getApiKey(provider) {
    console.log('');
    Utils.logInfo(`🔑 Setting up ${provider.toUpperCase()} API key:`);
    console.log('');
    
    // Show provider-specific instructions
    this.showApiKeyInstructions(provider);
    
    let apiKey;
    let isValid = false;
    
    while (!isValid) {
      apiKey = await this.askInput(`Enter your ${provider.toUpperCase()} API key`, true);
      
      if (!apiKey || apiKey.trim().length === 0) {
        Utils.logError('API key cannot be empty');
        continue;
      }

      // Validate API key format
      if (!Utils.validateApiKey(apiKey, provider)) {
        Utils.logError(`Invalid API key format for ${provider}`);
        this.showApiKeyFormat(provider);
        continue;
      }

      // Test API key
      Utils.logInfo('Testing API key...');
      const Providers = require('./providers');
      const providers = new Providers();
      
      try {
        isValid = await providers.testApiKey(provider, apiKey);
        if (!isValid) {
          Utils.logError('API key test failed. Please check your key and try again.');
        }
      } catch (error) {
        Utils.logError('Failed to test API key: ' + error.message);
        isValid = false;
      }
    }

    Utils.logSuccess('API key validated successfully!');
    return apiKey;
  }

  /**
   * Choose default model
   */
  async chooseModel(provider) {
    console.log('');
    const useDefault = await this.askYesNo(`Use default model for ${provider}? (recommended for beginners)`);
    
    if (useDefault) {
      return null; // Use provider default
    }

    Utils.logInfo(`Available models for ${provider}:`);
    const Providers = require('./providers');
    const providers = new Providers();
    const models = providers.getAvailableModels(provider);
    
    console.log('');
    models.forEach((model, index) => {
      console.log(`${index + 1}. ${model}`);
    });
    console.log(`${models.length + 1}. Use default`);
    console.log('');

    const choices = models.map((_, index) => (index + 1).toString());
    choices.push((models.length + 1).toString());
    
    const choice = await this.askChoice('Choose a model', choices);
    const choiceIndex = parseInt(choice) - 1;
    
    if (choiceIndex === models.length) {
      return null; // Use default
    }
    
    return models[choiceIndex];
  }

  /**
   * Configure agent settings
   */
  async configureAgent() {
    console.log('');
    Utils.logInfo('🤖 Agent Mode Configuration:');
    console.log('');
    Utils.logInfo('Agent mode allows Visaire to execute actions based on AI responses');
    Utils.logInfo('(like creating files, running commands, etc.)');
    console.log('');
    
    return await this.askYesNo('Enable agent mode? (recommended)');
  }

  /**
   * Show API key instructions for provider
   */
  showApiKeyInstructions(provider) {
    const instructions = {
      claude: [
        'To get your Claude API key:',
        '1. Go to https://console.anthropic.com',
        '2. Sign up or log in to your account',
        '3. Navigate to API Keys section',
        '4. Create a new API key',
        '5. Copy the key (starts with "sk-ant-")'
      ],
      gpt: [
        'To get your OpenAI API key:',
        '1. Go to https://platform.openai.com',
        '2. Sign up or log in to your account',
        '3. Navigate to API Keys section',
        '4. Create a new API key',
        '5. Copy the key (starts with "sk-")'
      ],
      gemini: [
        'To get your Gemini API key:',
        '1. Go to https://makersuite.google.com',
        '2. Sign in with your Google account',
        '3. Create a new API key',
        '4. Copy the generated key'
      ]
    };

    instructions[provider].forEach(line => {
      Utils.logInfo(line);
    });
    console.log('');
  }

  /**
   * Show API key format for provider
   */
  showApiKeyFormat(provider) {
    const formats = {
      claude: 'Claude API keys start with "sk-ant-" followed by alphanumeric characters',
      gpt: 'OpenAI API keys start with "sk-" followed by alphanumeric characters',
      gemini: 'Gemini API keys are alphanumeric strings (usually 39 characters)'
    };

    Utils.logInfo('Expected format: ' + formats[provider]);
  }

  /**
   * Show quick start guide
   */
  showQuickStart(provider) {
    Utils.logInfo('🎯 Quick Start Guide:');
    console.log('');
    Utils.logInfo('Now you can use Visaire with simple commands:');
    console.log('');
    console.log(`  visaire "Explain quantum computing"`);
    console.log(`  echo "Write a Python function" | visaire`);
    console.log('');
    Utils.logInfo('Other useful commands:');
    console.log('');
    console.log('  visaire --help              Show all options');
    console.log('  visaire config show          Show current configuration');
    console.log('  visaire config set --help    Update configuration');
    console.log('');
    Utils.logInfo('For more information, visit: https://github.com/shoryakumar/visaire-cli');
    console.log('');
  }

  /**
   * Ask yes/no question
   */
  async askYesNo(question) {
    const answer = await this.askChoice(question + ' (y/n)', ['y', 'n', 'yes', 'no']);
    return answer.toLowerCase().startsWith('y');
  }

  /**
   * Ask for input with validation
   */
  async askInput(question, required = false) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      const ask = () => {
        rl.question(question + ': ', (answer) => {
          if (required && (!answer || answer.trim().length === 0)) {
            Utils.logError('This field is required');
            ask();
          } else {
            rl.close();
            resolve(answer.trim());
          }
        });
      };
      ask();
    });
  }

  /**
   * Ask multiple choice question
   */
  async askChoice(question, validChoices) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      const ask = () => {
        rl.question(question + ': ', (answer) => {
          const trimmed = answer.trim().toLowerCase();
          const valid = validChoices.find(choice => 
            choice.toLowerCase() === trimmed
          );
          
          if (valid) {
            rl.close();
            resolve(valid);
          } else {
            Utils.logError(`Please enter one of: ${validChoices.join(', ')}`);
            ask();
          }
        });
      };
      ask();
    });
  }
}

module.exports = Setup;