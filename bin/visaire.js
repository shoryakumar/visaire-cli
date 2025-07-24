#!/usr/bin/env node

const { Command } = require('commander');
const Utils = require('../lib/utils');
const Config = require('../lib/config');
const Providers = require('../lib/providers');
const Agent = require('../lib/agent');
const Setup = require('../lib/setup');

const program = new Command();
const config = new Config();
const packageJson = require('../package.json');

/**
 * Handle config set command
 */
async function handleConfigSet(options) {
  try {
    const settings = {};
    
    if (options.provider) {
      settings.defaultProvider = options.provider;
    }
    
    if (options.model) {
      settings.defaultModel = options.model;
    }
    
    if (options.agentEnabled !== undefined) {
      settings['agent.enabled'] = options.agentEnabled === 'true';
    }
    
    if (options.autoApprove !== undefined) {
      settings['agent.autoApprove'] = options.autoApprove === 'true';
    }
    
    if (options.apiKey && options.provider) {
      if (!config.setApiKey(options.provider, options.apiKey)) {
        process.exit(1);
      }
      Utils.logSuccess(`API key set for ${options.provider}`);
    } else if (options.apiKey) {
      Utils.logError('Provider is required when setting API key');
      Utils.logInfo('Use: visaire config-set --set-api-key <key> --set-provider <provider>');
      process.exit(1);
    }
    
    if (Object.keys(settings).length > 0) {
      if (config.setMultiple(settings)) {
        Utils.logSuccess('Configuration updated successfully');
      } else {
        process.exit(1);
      }
    }
    
    if (Object.keys(settings).length === 0 && !options.apiKey) {
      Utils.logInfo('No configuration changes specified');
      Utils.logInfo('Available options: --set-api-key, --set-provider, --set-model, --set-agent-enabled, --set-auto-approve');
    }
    
  } catch (error) {
    Utils.logError('Configuration error: ' + error.message);
    process.exit(1);
  }
}

/**
 * Handle main command (prompt processing)
 */
async function handleMainCommand(promptArgs, options) {
  try {
    // Handle version command
    if (options.version) {
      console.log(packageJson.version);
      return;
    }

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
      Utils.logError('No provider configured.');
      Utils.logInfo('Run "visaire setup" to configure your first provider, or use --provider flag.');
      Utils.logInfo('Example: visaire --provider claude --api-key sk-ant-xxx "your prompt"');
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
    const apiKey = options.apiKey || config.getApiKey(provider);
    if (!apiKey) {
      Utils.logError('No API key found for ' + provider);
      Utils.logInfo('Set up your API key using one of these methods:');
      Utils.logInfo('1. Run "visaire setup" for interactive configuration');
      Utils.logInfo(`2. Use: visaire config-set --set-api-key <key> --set-provider ${provider}`);
      Utils.logInfo(`3. Set environment variable: ${provider.toUpperCase()}_API_KEY=<key>`);
      Utils.logInfo('4. Use --api-key flag: visaire --provider ' + provider + ' --api-key <key> "prompt"');
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
      Utils.logInfo('Examples:');
      Utils.logInfo('  visaire "Explain quantum computing"');
      Utils.logInfo('  echo "Write a Python function" | visaire');
      Utils.logInfo('  visaire --help  # for more options');
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

    // Determine if agent mode is enabled
    const agentEnabled = options.agent !== false && appConfig.agent?.enabled !== false;
    
    // Make API call
    const spinner = Utils.createSpinner(`Sending request to ${provider}...`);
    spinner.start();

    const providers = new Providers(appConfig);
    
    try {
      const response = await providers.call(provider, apiKey, prompt, providerOptions);
      
      spinner.stop();
      
      if (agentEnabled) {
        // Use agent mode
        Utils.logInfo('🤖 Agent mode enabled - analyzing response for actionable tasks...');
        
        const agent = new Agent({
          confirmationEnabled: !options.autoApprove && appConfig.agent?.confirmationEnabled !== false,
          autoApprove: options.autoApprove || appConfig.agent?.autoApprove === true,
          maxActionsPerPrompt: appConfig.agent?.maxActionsPerPrompt || 10,
          logger: appConfig.logger
        });

        // Configure agent with security settings
        if (appConfig.agent?.toolSecurity) {
          agent.configure({ toolSecurity: appConfig.agent.toolSecurity });
        }

        const agentResult = await agent.processPrompt(prompt, response, {
          provider,
          model: options.model,
          timestamp: new Date().toISOString()
        });

        // Display response
        console.log(Utils.formatResponse(response, provider));
        
        if (agentResult.executed && agentResult.results) {
          Utils.logInfo('\n🔧 Agent executed the following actions:');
          
          agentResult.results.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${result.action.type}: ${result.action.source}`);
            
            if (!result.success && result.result.error) {
              Utils.logError(`   Error: ${result.result.error}`);
            }
          });
        } else if (agentResult.actions.length > 0 && !agentResult.executed) {
          Utils.logInfo(`\n🤖 Agent detected ${agentResult.actions.length} potential action(s) but did not execute them`);
          if (agentResult.reason) {
            Utils.logInfo(`   Reason: ${agentResult.reason}`);
          }
        }

        // End agent session
        await agent.endSession();
        
      } else {
        // Standard mode - just display response
        console.log(Utils.formatResponse(response, provider));
      }
      
      Utils.logSuccess('Request completed successfully');
      
    } catch (error) {
      spinner.stop();
      
      Utils.logError('Request failed: ' + error.message);
      
      // Provide helpful suggestions based on error type
      if (error.message.includes('Invalid API key')) {
        Utils.logInfo('Double-check your API key and ensure it has the correct permissions');
        Utils.logInfo(`Set via: visaire config-set --set-api-key <key> --set-provider ${provider}`);
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
    .option('--agent', 'Enable agentic mode (default: true)')
    .option('--no-agent', 'Disable agentic mode')
    .option('--auto-approve', 'Auto-approve agent actions without confirmation')
    .option('--config', 'Show current configuration')
    .option('--config-example', 'Create example configuration file')
    .option('--config-reset', 'Reset configuration to defaults')
    .option('--test-key', 'Test API key validity')
    .option('--version', 'Show version information')
    .argument('[prompt...]', 'The prompt to send to the LLM')
    .action(async (promptArgs, options) => {
      await handleMainCommand(promptArgs, options);
    })
    .helpOption('-h, --help', 'Display help for command');

  // Add setup command
  program
    .command('setup')
    .description('Interactive setup for first-time users')
    .action(async () => {
      const setup = new Setup();
      await setup.run();
    });

  // Add config subcommands
  program
    .command('config-show')
    .description('Show current configuration')
    .action(() => {
      config.display();
    });

  program
    .command('config-set')
    .description('Set configuration values')
    .option('--set-api-key <key>', 'Set API key for provider')
    .option('--set-provider <provider>', 'Set default provider')
    .option('--set-model <model>', 'Set default model')
    .option('--set-agent-enabled <boolean>', 'Enable/disable agent mode')
    .option('--set-auto-approve <boolean>', 'Enable/disable auto-approval')
    .action(async (options) => {
      // Map the renamed options back to the expected names
      const mappedOptions = {
        apiKey: options.setApiKey,
        provider: options.setProvider,
        model: options.setModel,
        agentEnabled: options.setAgentEnabled,
        autoApprove: options.setAutoApprove
      };
      await handleConfigSet(mappedOptions);
    });

  program
    .command('config-reset')
    .description('Reset configuration to defaults')
    .action(() => {
      config.reset();
    });

  program.parse();
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