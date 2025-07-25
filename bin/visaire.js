#!/usr/bin/env node

const { Command } = require('commander');
const Utils = require('../lib/utils');
const Config = require('../lib/config');
const Providers = require('../lib/providers');
const EnhancedAgent = require('../lib/EnhancedAgent');
const Setup = require('../lib/setup');
const SpinnerManager = require('../lib/SpinnerManager');

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
      Utils.logInfo('Available options: --set-api-key, --set-provider, --set-model, --set-agent-enabled');
    }
    
  } catch (error) {
    Utils.logError('Configuration error: ' + error.message);
    process.exit(1);
  }
}

/**
 * Display autonomous session results
 */
function displayAutonomousResults(result) {
  console.log('\n📊 Autonomous Session Summary:');
  console.log(`   Iterations: ${result.summary.totalIterations}`);
  console.log(`   Actions executed: ${result.summary.totalActions}`);
  console.log(`   Files created/modified: ${result.summary.totalFiles}`);
  console.log(`   Commands run: ${result.summary.totalCommands}`);
  console.log(`   Processing time: ${Math.round(result.summary.processingTime / 1000)}s`);
  
  if (result.summary.totalErrors > 0) {
    console.log(`   Errors: ${result.summary.totalErrors}`);
  }

  // Show final response
  if (result.results.length > 0) {
    const finalResult = result.results[result.results.length - 1];
    if (finalResult.response) {
      console.log('\n📝 Final Response:');
      console.log(Utils.formatResponse(finalResult.response, 'agent'));
    }
  }
}

/**
 * Display visaire agent results
 */
function displayEnhancedResults(result) {
  // Show LLM response
  if (result.response) {
    console.log(Utils.formatResponse(result.response, 'agent'));
  }

  // Show execution summary
  if (result.summary) {
    console.log('\n🔧 Execution Summary:');
    console.log(`   Actions planned: ${result.summary.actionsPlanned}`);
    console.log(`   Actions executed: ${result.summary.actionsExecuted}`);
    
    if (result.summary.filesCreated > 0) {
      console.log(`   Files created: ${result.summary.filesCreated}`);
    }
    
    if (result.summary.filesModified > 0) {
      console.log(`   Files modified: ${result.summary.filesModified}`);
    }
    
    if (result.summary.commandsRun > 0) {
      console.log(`   Commands executed: ${result.summary.commandsRun}`);
    }
    
    if (result.summary.errors > 0) {
      console.log(`   Errors: ${result.summary.errors}`);
    }
  }

  // Show reasoning information if in debug mode
  if (process.env.DEBUG && result.reasoning) {
    console.log('\n🧠 Reasoning Details:');
    console.log(`   Effort level: ${result.reasoning.effort}`);
    console.log(`   Complexity: ${result.reasoning.complexity?.level || 'unknown'}`);
    console.log(`   Iterations: ${result.reasoning.iterations}`);
    console.log(`   Confidence: ${Math.round((result.reasoning.confidence || 0) * 100)}%`);
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
      const spinner = new SpinnerManager();
      spinner.start('Testing API key');

      const providers = new Providers(appConfig);
      const isValid = await providers.testApiKey(provider, apiKey);

      if (isValid) {
        spinner.succeed(`${provider.toUpperCase()} API key is valid and working`);
      } else {
        spinner.fail(`${provider.toUpperCase()} API key test failed`);
        process.exit(1);
      }
      return;
    }

    // Check if we should enter interactive mode
    const shouldEnterInteractiveMode = promptArgs.length === 0 && !Utils.isStdinInput();
    
    if (shouldEnterInteractiveMode) {
      // Start interactive session
      const InteractiveSession = require('../lib/InteractiveSession');
      const sessionOptions = {
        model: options.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        agent: options.agent // Pass agent configuration to interactive session
      };
      
      const session = new InteractiveSession(appConfig, provider, apiKey, sessionOptions);
      await session.start();
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

    // Determine agent mode and effort level
    // CLI option takes precedence: if explicitly set to false, disable regardless of config
    const agentEnabled = options.agent === false ? false : (options.agent === true || appConfig.agent?.enabled === true);
    const autonomousMode = options.autonomous || appConfig.agent?.autonomous === true;
    const effortLevel = options.effort || appConfig.agent?.effort || 'medium';
    
    // Always auto-approve for immediate tool and command execution
    const autoApprove = true;
    
    // For simple prompts without agent mode, use direct provider call
    if (!agentEnabled) {
      const spinner = new SpinnerManager();
      
      // Start with random thinking message
      const thinkingMessages = ['Thinking', 'Processing', 'Analyzing', 'Reasoning', 'Computing'];
      const randomMessage = thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)];
      spinner.start(randomMessage);

      try {
        // Update message during processing
        setTimeout(() => {
          if (spinner.isRunning()) {
            spinner.updateMessage('Processing');
          }
        }, 1000);

        setTimeout(() => {
          if (spinner.isRunning()) {
            spinner.updateMessage('Generating');
          }
        }, 2000);

        const providers = new Providers(appConfig);
        const response = await providers.call(provider, apiKey, prompt, {
          model: options.model,
          maxTokens: options.maxTokens,
          temperature: options.temperature
        });
        
        // Success with timing
        spinner.succeed(`Response generated in ${spinner.getElapsedTime()}s`);
        
        // Clean output without technical artifacts
        console.log('\n' + response + '\n');
        
      } catch (error) {
        // Error with timing
        spinner.fail(`Request failed after ${spinner.getElapsedTime()}s`);
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
      return;
    }

    // Use visaire agent mode for complex tasks
    const agent = new EnhancedAgent({
      provider,
      apiKey,
      model: options.model || appConfig.defaultModel,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      effort: effortLevel,
      autoApprove: autoApprove, // Always true for immediate tool execution
      confirmationRequired: false, // Disable confirmation for immediate execution
      maxIterations: options.maxIterations || appConfig.agent?.maxIterations || 10,
      logLevel: options.debug ? 'debug' : 'info',
      enableMetrics: true,
      enableTracing: options.trace || false,
      security: appConfig.agent?.toolSecurity || {},
      timeout: options.timeout || appConfig.timeout
    });

    // Setup event handlers for user interaction (disabled for immediate execution)
    // agent.on('confirmation:required', async ({ action, callback }) => {
    //   callback(true); // Always approve for immediate tool execution
    // });

    // Handle Ctrl+C gracefully
    const originalHandler = process.listeners('SIGINT')[0];
    process.removeAllListeners('SIGINT');
    process.on('SIGINT', async () => {
      console.log('\n');
      Utils.logInfo('Shutting down agent...');
      try {
        await agent.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
      process.exit(0);
    });

    try {
      let result;
      
      if (agentEnabled && autonomousMode) {
        // Use autonomous mode
        Utils.logInfo('🤖 Autonomous agent mode enabled - executing multi-step tasks automatically...');
        Utils.logInfo(`   Effort level: ${effortLevel}`);
        Utils.logInfo('   Press Ctrl+C to stop at any time');
        
        result = await agent.startAutonomousSession(prompt, {
          maxIterations: options.maxIterations || 10,
          effort: effortLevel
        });

        // Display autonomous session results
        displayAutonomousResults(result);
        
      } else if (agentEnabled) {
        // Use visaire agent mode
        Utils.logInfo('🤖 Visaire agent mode enabled - sophisticated reasoning and planning...');
        Utils.logInfo(`   Effort level: ${effortLevel}`);
        
        result = await agent.processPrompt(prompt, {
          effort: effortLevel,
          autoApprove: autoApprove // Always true for immediate tool execution
        });

        // Display enhanced results
        displayEnhancedResults(result);
      }

      // Cleanup
      await agent.shutdown();

    } catch (error) {
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
    } finally {
      // Restore original handler
      process.removeAllListeners('SIGINT');
      if (originalHandler) {
        process.on('SIGINT', originalHandler);
      }
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
    .description('Enhanced CLI tool for interacting with Large Language Models')
    .version(packageJson.version)
    .option('-p, --provider <provider>', 'LLM provider (claude, gemini, gpt)')
    .option('-k, --api-key <key>', 'API key for the provider')
    .option('-m, --model <model>', 'Specific model to use (optional)')
    .option('-t, --timeout <ms>', 'Request timeout in milliseconds', parseInt)
    .option('--max-tokens <tokens>', 'Maximum tokens in response', parseInt)
    .option('--temperature <temp>', 'Temperature for response generation', parseFloat)
    .option('--agent', 'Enable visaire agent mode (default: false)')
    .option('--no-agent', 'Disable agent mode')
    .option('--autonomous', 'Enable autonomous multi-step execution')
    .option('--effort <level>', 'Reasoning effort level (low, medium, high, maximum)', 'medium')
    .option('--max-iterations <num>', 'Maximum iterations for autonomous mode', parseInt)
    .option('--debug', 'Enable debug logging')
    .option('--trace', 'Enable execution tracing')
    .option('--config', 'Show current configuration')
    .option('--config-example', 'Create example configuration file')
    .option('--config-reset', 'Reset configuration to defaults')
    .option('--test-key', 'Test API key validity')
    .option('--version', 'Show version information')
    .argument('[prompt...]', 'The prompt to send to the LLM (omit for interactive mode)')
    .action(async (promptArgs, options) => {
      await handleMainCommand(promptArgs, options);
    })
    .helpOption('-h, --help', 'Display help for command');

  // Add interactive command
  program
    .command('interactive')
    .description('Start interactive conversation mode')
    .option('-p, --provider <provider>', 'LLM provider (claude, gemini, gpt)')
    .option('-m, --model <model>', 'Specific model to use')
    .option('--max-tokens <tokens>', 'Maximum tokens in response', parseInt)
    .option('--temperature <temp>', 'Temperature for response generation', parseFloat)
    .action(async (options) => {
      // Load configuration
      const appConfig = config.getConfig({
        defaultProvider: options.provider
      });

      const provider = options.provider || appConfig.defaultProvider;
      if (!provider) {
        Utils.logError('No provider configured.');
        Utils.logInfo('Run "visaire setup" to configure your first provider.');
        process.exit(1);
      }

      const apiKey = config.getApiKey(provider);
      if (!apiKey) {
        Utils.logError('No API key found for ' + provider);
        Utils.logInfo('Run "visaire setup" to configure your API key.');
        process.exit(1);
      }

      const InteractiveSession = require('../lib/InteractiveSession');
      const sessionOptions = {
        model: options.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        agent: options.agent // Pass agent configuration to interactive session
      };
      
      const session = new InteractiveSession(appConfig, provider, apiKey, sessionOptions);
      await session.start();
    });

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
    .action(async (options) => {
      // Map the renamed options back to the expected names
      const mappedOptions = {
        apiKey: options.setApiKey,
        provider: options.setProvider,
        model: options.setModel,
        agentEnabled: options.setAgentEnabled
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