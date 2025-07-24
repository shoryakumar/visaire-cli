const fs = require('fs');
const path = require('path');
const os = require('os');
const Utils = require('./utils');

/**
 * Configuration management for .visairerc files
 */
class Config {
  constructor() {
    this.configPath = path.join(os.homedir(), '.visairerc');
    this.defaultConfig = {
      defaultProvider: null,
      timeout: 30000,
      maxRetries: 3,
      outputFormat: 'text',
      // Agent-specific settings
      agent: {
        enabled: true,
        confirmationEnabled: false, // No confirmation required for tool execution
        autoApprove: true, // Always auto-approve tool and command execution
        maxActionsPerPrompt: 10,
        toolSecurity: {
          allowedCommands: [
            'npm', 'node', 'git', 'ls', 'pwd', 'cat', 'echo', 'mkdir', 'touch',
            'grep', 'find', 'curl', 'wget', 'which', 'whereis', 'ps'
          ],
          blockedCommands: [
            'rm', 'rmdir', 'del', 'format', 'fdisk', 'mkfs', 'dd', 'sudo', 'su',
            'chmod', 'chown', 'passwd', 'shutdown', 'reboot', 'halt', 'init'
          ],
          maxExecutionTime: 30000,
          maxOutputSize: 1048576
        }
      },
      // API keys (optional - can use env vars instead)
      apiKeys: {}
    };
  }

  /**
   * Load configuration from .visairerc file
   */
  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const userConfig = JSON.parse(configData);
        
        // Merge with defaults
        const config = { ...this.defaultConfig, ...userConfig };
        
        // Validate configuration
        this.validateConfig(config);
        
        return config;
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        Utils.logWarning(`Invalid JSON in config file: ${this.configPath}`);
        Utils.logInfo('Using default configuration');
      } else {
        Utils.logWarning(`Could not read config file: ${error.message}`);
        Utils.logInfo('Using default configuration');
      }
    }
    
    return this.defaultConfig;
  }

  /**
   * Save configuration to .visairerc file
   */
  save(config) {
    try {
      const configToSave = { ...this.defaultConfig, ...config };
      this.validateConfig(configToSave);
      
      const configData = JSON.stringify(configToSave, null, 2);
      fs.writeFileSync(this.configPath, configData, 'utf8');
      
      Utils.logSuccess(`Configuration saved to ${this.configPath}`);
      return true;
    } catch (error) {
      Utils.logError(`Could not save config file: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate configuration object
   */
  validateConfig(config) {
    const validProviders = ['claude', 'gemini', 'gpt'];
    const validOutputFormats = ['text', 'json', 'markdown'];

    if (config.defaultProvider && !validProviders.includes(config.defaultProvider)) {
      throw new Error(`Invalid default provider: ${config.defaultProvider}. Must be one of: ${validProviders.join(', ')}`);
    }

    if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 1000)) {
      throw new Error('Timeout must be a number >= 1000 milliseconds');
    }

    if (config.maxRetries && (typeof config.maxRetries !== 'number' || config.maxRetries < 0)) {
      throw new Error('Max retries must be a non-negative number');
    }

    if (config.outputFormat && !validOutputFormats.includes(config.outputFormat)) {
      throw new Error(`Invalid output format: ${config.outputFormat}. Must be one of: ${validOutputFormats.join(', ')}`);
    }

    // Validate agent settings
    if (config.agent) {
      if (config.agent.maxActionsPerPrompt !== undefined && (typeof config.agent.maxActionsPerPrompt !== 'number' || config.agent.maxActionsPerPrompt < 1)) {
        throw new Error('Agent maxActionsPerPrompt must be a positive number');
      }

      if (config.agent.toolSecurity) {
        const security = config.agent.toolSecurity;
        
        if (security.maxExecutionTime && (typeof security.maxExecutionTime !== 'number' || security.maxExecutionTime < 1000)) {
          throw new Error('Tool security maxExecutionTime must be >= 1000 milliseconds');
        }

        if (security.maxOutputSize && (typeof security.maxOutputSize !== 'number' || security.maxOutputSize < 1024)) {
          throw new Error('Tool security maxOutputSize must be >= 1024 bytes');
        }
      }
    }
  }

  /**
   * Get configuration with command line overrides
   */
  getConfig(cliOptions = {}) {
    const fileConfig = this.load();
    
    // CLI options override file config
    const finalConfig = {
      ...fileConfig,
      ...Object.fromEntries(
        Object.entries(cliOptions).filter(([, value]) => value !== undefined)
      )
    };

    return finalConfig;
  }

  /**
   * Create example configuration file
   */
  createExample() {
    const exampleConfig = {
      defaultProvider: "claude",
      timeout: 30000,
      maxRetries: 3,
      outputFormat: "text"
    };

    const examplePath = path.join(os.homedir(), '.visairerc.example');
    
    try {
      const configData = JSON.stringify(exampleConfig, null, 2);
      fs.writeFileSync(examplePath, configData, 'utf8');
      
      Utils.logSuccess(`Example configuration created at ${examplePath}`);
      Utils.logInfo('Copy this file to .visairerc and modify as needed');
      
      return true;
    } catch (error) {
      Utils.logError(`Could not create example config: ${error.message}`);
      return false;
    }
  }

  /**
   * Display current configuration
   */
  display() {
    const config = this.load();
    
    console.log('\n📋 Current Configuration:');
    console.log('─'.repeat(30));
    
    Object.entries(config).forEach(([key, value]) => {
      let displayValue;
      if (value === null || value === undefined) {
        displayValue = 'not set';
      } else if (typeof value === 'object') {
        displayValue = JSON.stringify(value, null, 2);
      } else {
        displayValue = value;
      }
      console.log(`${key}: ${displayValue}`);
    });
    
    console.log(`\nConfig file: ${this.configPath}`);
    console.log(`Exists: ${fs.existsSync(this.configPath) ? 'Yes' : 'No'}\n`);
  }

  /**
   * Check if config file exists
   */
  exists() {
    return fs.existsSync(this.configPath);
  }

  /**
   * Get config file path
   */
  getConfigPath() {
    return this.configPath;
  }

  /**
   * Reset configuration to defaults
   */
  reset() {
    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
        Utils.logSuccess('Configuration file deleted');
      } else {
        Utils.logInfo('No configuration file to delete');
      }
      return true;
    } catch (error) {
      Utils.logError(`Could not delete config file: ${error.message}`);
      return false;
    }
  }
  /**
   * Set configuration value
   */
  set(key, value) {
    try {
      const config = this.load();
      
      // Handle nested keys (e.g., 'agent.enabled')
      const keys = key.split('.');
      let current = config;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      
      // Validate and save
      this.validateConfig(config);
      return this.save(config);
    } catch (error) {
      Utils.logError(`Could not set config value: ${error.message}`);
      return false;
    }
  }

  /**
   * Get configuration value
   */
  get(key) {
    try {
      const config = this.load();
      
      // Handle nested keys
      const keys = key.split('.');
      let current = config;
      
      for (const k of keys) {
        if (current[k] === undefined) {
          return undefined;
        }
        current = current[k];
      }
      
      return current;
    } catch (error) {
      Utils.logError(`Could not get config value: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Set multiple configuration values
   */
  setMultiple(settings) {
    try {
      const config = this.load();
      
      // Apply all settings
      for (const [key, value] of Object.entries(settings)) {
        const keys = key.split('.');
        let current = config;
        
        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
      }
      
      // Validate and save
      this.validateConfig(config);
      return this.save(config);
    } catch (error) {
      Utils.logError(`Could not set config values: ${error.message}`);
      return false;
    }
  }

  /**
   * Set API key for provider
   */
  setApiKey(provider, apiKey) {
    const validProviders = ['claude', 'gemini', 'gpt'];
    
    if (!validProviders.includes(provider)) {
      Utils.logError(`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`);
      return false;
    }

    if (!Utils.validateApiKey(apiKey, provider)) {
      Utils.logError(`Invalid API key format for ${provider}`);
      return false;
    }

    return this.set(`apiKeys.${provider}`, apiKey);
  }

  /**
   * Get API key for provider
   */
  getApiKey(provider) {
    // First check config file
    const configKey = this.get(`apiKeys.${provider}`);
    if (configKey) {
      return configKey;
    }

    // Fall back to environment variables
    return process.env[`${provider.toUpperCase()}_API_KEY`];
  }
}

module.exports = Config;