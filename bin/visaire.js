#!/usr/bin/env node

const { Command } = require('commander');
const Utils = require('../lib/utils');
const Config = require('../lib/config');
const Providers = require('../lib/providers');

const program = new Command();
const config = new Config();
const packageJson = require('../package.json');

/**
 * Main CLI application
 */
async function main() {
  // Configure commander
  program
    .name('visaire')
    .description('CLI tool for interacting with Large Language Models')
    .version(packageJson.version)
    .option('-p, --provider <provider>', 'LLM provider (claude, gemini, gpt)')
    .option('-k, --api-key <key>', 'API key for the provider')
    .option('-m, --model <model>', 'Specific model to use (optional)')
    .option('-t, --timeout <ms>', 'Request timeout in milliseconds', parseInt)
    .option('--max-tokens <tokens>', 'Maximum tokens in response', parseInt)
    .option('--temperature <temp>', 'Temperature for response generation', parseFloat)
    .option('--config', 'Show current configuration')
    .option('--config-example', 'Create example configuration file')
    .option('--config-reset', 'Reset configuration to defaults')
    .option('--test-key', 'Test API key validity')
    .argument('[prompt...]', 'The prompt to send to the LLM')
    .helpOption('-h, --help', 'Display help for command');

  program.parse();

  const options = program.opts();
  const promptArgs = program.args;

  try {
    // Handle configuration commands
    if (options.config) {
      config.display();
      return;
    }

    if (options.configExample) {
      config.createExample();
      return;
    }

    if (options.configReset) {
      config.reset();
      return;
    }

    // Load configuration
    const appConfig = config.getConfig({
      defaultProvider: options.provider,
      timeout: options.timeout
    });

    // Determine provider
    const provider = options.provider || appConfig.defaultProvider;
    if (!provider) {
      Utils.logError('Provider is required. Use --provider or set defaultProvider in .visairerc');
      Utils.logInfo('Supported providers: claude, gemini, gpt');
      process.exit(1);
    }

    // Validate provider
    const validProviders = ['claude', 'gemini', 'gpt'];
    if (!validProviders.includes(provider)) {
      Utils.logError(`Invalid provider: ${provider}`);
      Utils.logInfo(`Supported providers: ${validProviders.join(', ')}`);
      process.exit(1);
    }

    // Get API key
    const apiKey = options.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`];
    if (!apiKey) {
      Utils.logError('API key is required');
      Utils.logInfo(`Provide via --api-key flag or ${provider.toUpperCase()}_API_KEY environment variable`);
      process.exit(1);
    }

    // Test API key if requested
    if (options.testKey) {
      const spinner = Utils.createSpinner(`Testing ${provider} API key...`);
      spinner.start();

      const providers = new Providers(appConfig);
      const isValid = await providers.testApiKey(provider, apiKey);

      spinner.stop();
      
      if (isValid) {
        Utils.logSuccess(`${provider} API key is valid and working`);
      } else {
        Utils.logError(`${provider} API key test failed`);
        process.exit(1);
      }
      return;
    }

    // Get prompt from arguments or stdin
    let prompt = '';
    
    if (promptArgs.length > 0) {
      // Prompt provided as command line arguments
      prompt = promptArgs.join(' ');
    } else if (Utils.isStdinInput()) {
      // Read from stdin (piped input)
      try {
        prompt = await Utils.readStdin();
      } catch (error) {
        Utils.logError('Failed to read from stdin: ' + error.message);
        process.exit(1);
      }
    } else {
      // No prompt provided
      Utils.logError('No prompt provided');
      Utils.logInfo('Provide a prompt as arguments or pipe input via stdin');
      Utils.logInfo('Example: visaire --provider claude --api-key sk-xxx "Your prompt here"');
      Utils.logInfo('Example: echo "Your prompt" | visaire --provider claude --api-key sk-xxx');
      process.exit(1);
    }

    if (!prompt || prompt.trim().length === 0) {
      Utils.logError('Prompt cannot be empty');
      process.exit(1);
    }

    // Validate API key format
    if (!Utils.validateApiKey(apiKey, provider)) {
      Utils.logError(`Invalid API key format for ${provider}`);
      Utils.logInfo('Please check your API key and try again');
      process.exit(1);
    }

    // Show security warning for command-line API keys
    if (options.apiKey) {
      Utils.logWarning('API key provided via command line is visible in process lists');
      Utils.logInfo('Consider using environment variables or config file for better security');
    }

    // Prepare provider options
    const providerOptions = {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature
    };

    // Remove undefined options
    Object.keys(providerOptions).forEach(key => {
      if (providerOptions[key] === undefined) {
        delete providerOptions[key];
      }
    });

    // Make API call
    const spinner = Utils.createSpinner(`Sending request to ${provider}...`);
    spinner.start();

    const providers = new Providers(appConfig);
    
    try {
      const response = await providers.call(provider, apiKey, prompt, providerOptions);
      
      spinner.stop();
      
      // Display response
      console.log(Utils.formatResponse(response, provider));
      
      Utils.logSuccess('Request completed successfully');
      
    } catch (error) {
      spinner.stop();
      
      Utils.logError('Request failed: ' + error.message);
      
      // Provide helpful suggestions based on error type
      if (error.message.includes('Invalid API key')) {
        Utils.logInfo('Double-check your API key and ensure it has the correct permissions');
      } else if (error.message.includes('Rate limit')) {
        Utils.logInfo('Wait a moment before trying again, or check your API usage limits');
      } else if (error.message.includes('Network error')) {
        Utils.logInfo('Check your internet connection and try again');
      }
      
      process.exit(1);
    }

  } catch (error) {
    Utils.logError('Unexpected error: ' + error.message);
    
    if (process.env.DEBUG) {
      console.error('\nDebug information:');
      console.error(error.stack);
    } else {
      Utils.logInfo('Run with DEBUG=1 for more detailed error information');
    }
    
    process.exit(1);
  }
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  Utils.logError('Uncaught exception: ' + error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  Utils.logError('Unhandled rejection: ' + reason);
  process.exit(1);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n');
  Utils.logInfo('Operation cancelled by user');
  process.exit(0);
});

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    Utils.logError('Application error: ' + error.message);
    process.exit(1);
  });
}

module.exports = { main };