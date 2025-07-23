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
      outputFormat: 'text'
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
      const displayValue = value === null ? 'not set' : value;
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
}

module.exports = Config;