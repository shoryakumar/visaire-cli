const Config = require('../lib/config');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('Config', () => {
  let config;
  let testConfigPath;
  let originalConfigPath;

  beforeEach(() => {
    // Create temporary config file for testing
    testConfigPath = path.join(os.tmpdir(), '.visairerc-test-' + Date.now());
    
    config = new Config();
    originalConfigPath = config.configPath;
    config.configPath = testConfigPath;
  });

  afterEach(async () => {
    // Clean up test config file
    if (await fs.pathExists(testConfigPath)) {
      await fs.remove(testConfigPath);
    }
    
    // Restore original config path
    config.configPath = originalConfigPath;
  });

  describe('Configuration Loading', () => {
    test('should load default configuration when file does not exist', () => {
      const loadedConfig = config.load();
      
      expect(loadedConfig).toHaveProperty('defaultProvider', null);
      expect(loadedConfig).toHaveProperty('timeout', 30000);
      expect(loadedConfig).toHaveProperty('agent');
      expect(loadedConfig.agent).toHaveProperty('enabled', true);
      expect(loadedConfig.agent).toHaveProperty('confirmationEnabled', false); // No confirmation for tool execution
      expect(loadedConfig.agent).toHaveProperty('autoApprove', true); // Auto-approve tool and command execution
    });

    test('should load configuration from file when it exists', async () => {
      const testConfig = {
        defaultProvider: 'claude',
        timeout: 60000,
        agent: {
          enabled: false,
          maxActionsPerPrompt: 5
        }
      };
      
      await fs.writeJson(testConfigPath, testConfig);
      
      const loadedConfig = config.load();
      
      expect(loadedConfig.defaultProvider).toBe('claude');
      expect(loadedConfig.timeout).toBe(60000);
      expect(loadedConfig.agent.enabled).toBe(false);
      expect(loadedConfig.agent.maxActionsPerPrompt).toBe(5);
    });

    test('should handle invalid JSON gracefully', async () => {
      await fs.writeFile(testConfigPath, 'invalid json content');
      
      const loadedConfig = config.load();
      
      // Should fall back to defaults
      expect(loadedConfig.defaultProvider).toBeNull();
      expect(loadedConfig.timeout).toBe(30000);
    });
  });

  describe('Configuration Saving', () => {
    test('should save configuration to file', () => {
      const testConfig = {
        defaultProvider: 'gpt',
        timeout: 45000,
        agent: {
          enabled: true,
          autoApprove: true
        }
      };
      
      const result = config.save(testConfig);
      
      expect(result).toBe(true);
      expect(fs.pathExistsSync(testConfigPath)).toBe(true);
      
      const savedConfig = fs.readJsonSync(testConfigPath);
      expect(savedConfig.defaultProvider).toBe('gpt');
      expect(savedConfig.agent.autoApprove).toBe(true);
    });

    test('should validate configuration before saving', () => {
      const invalidConfig = {
        defaultProvider: 'invalid-provider',
        timeout: 500 // Too low
      };
      
      const result = config.save(invalidConfig);
      
      expect(result).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    test('should validate valid configuration', () => {
      const validConfig = {
        defaultProvider: 'claude',
        timeout: 30000,
        maxRetries: 3,
        outputFormat: 'text',
        agent: {
          enabled: true,
          maxActionsPerPrompt: 10,
          toolSecurity: {
            maxExecutionTime: 30000,
            maxOutputSize: 1048576
          }
        }
      };
      
      expect(() => config.validateConfig(validConfig)).not.toThrow();
    });

    test('should reject invalid provider', () => {
      const invalidConfig = {
        defaultProvider: 'invalid-provider'
      };
      
      expect(() => config.validateConfig(invalidConfig)).toThrow('Invalid default provider');
    });

    test('should reject invalid timeout', () => {
      const invalidConfig = {
        timeout: 500 // Too low
      };
      
      expect(() => config.validateConfig(invalidConfig)).toThrow('Timeout must be a number >= 1000');
    });

    test('should reject invalid agent settings', () => {
      const invalidConfig = {
        agent: {
          maxActionsPerPrompt: 0 // Too low
        }
      };
      
      expect(() => config.validateConfig(invalidConfig)).toThrow('Agent maxActionsPerPrompt must be a positive number');
    });

    test('should reject invalid tool security settings', () => {
      const invalidConfig = {
        agent: {
          toolSecurity: {
            maxExecutionTime: 500 // Too low
          }
        }
      };
      
      expect(() => config.validateConfig(invalidConfig)).toThrow('maxExecutionTime must be >= 1000');
    });
  });

  describe('Configuration Getting and Setting', () => {
    test('should set and get simple values', () => {
      const result = config.set('defaultProvider', 'claude');
      expect(result).toBe(true);
      
      const value = config.get('defaultProvider');
      expect(value).toBe('claude');
    });

    test('should set and get nested values', () => {
      const result = config.set('agent.enabled', false);
      expect(result).toBe(true);
      
      const value = config.get('agent.enabled');
      expect(value).toBe(false);
    });

    test('should set multiple values at once', () => {
      const settings = {
        'defaultProvider': 'gpt',
        'agent.autoApprove': true,
        'agent.maxActionsPerPrompt': 5
      };
      
      const result = config.setMultiple(settings);
      expect(result).toBe(true);
      
      expect(config.get('defaultProvider')).toBe('gpt');
      expect(config.get('agent.autoApprove')).toBe(true);
      expect(config.get('agent.maxActionsPerPrompt')).toBe(5);
    });

    test('should return undefined for non-existent keys', () => {
      const value = config.get('nonexistent.key');
      expect(value).toBeUndefined();
    });
  });

  describe('API Key Management', () => {
    test('should set and get API keys', () => {
      const apiKey = 'sk-ant-test-key-12345678901234567890'; // Valid format for Claude
      
      const result = config.setApiKey('claude', apiKey);
      expect(result).toBe(true);
      
      const retrievedKey = config.getApiKey('claude');
      expect(retrievedKey).toBe(apiKey);
    });

    test('should reject invalid providers for API keys', () => {
      const result = config.setApiKey('invalid-provider', 'sk-test-key');
      expect(result).toBe(false);
    });

    test('should validate API key format', () => {
      const result = config.setApiKey('claude', 'invalid-key-format');
      expect(result).toBe(false);
    });

    test('should fall back to environment variables', () => {
      // Set environment variable
      process.env.CLAUDE_API_KEY = 'sk-env-test-key';
      
      const retrievedKey = config.getApiKey('claude');
      expect(retrievedKey).toBe('sk-env-test-key');
      
      // Clean up
      delete process.env.CLAUDE_API_KEY;
    });

    test('should prefer config file over environment variables', () => {
      const configKey = 'sk-ant-config-key-12345678901234567890';
      const envKey = 'sk-ant-env-key-12345678901234567890';
      
      // Set both config and environment
      config.setApiKey('claude', configKey);
      process.env.CLAUDE_API_KEY = envKey;
      
      const retrievedKey = config.getApiKey('claude');
      expect(retrievedKey).toBe(configKey);
      
      // Clean up
      delete process.env.CLAUDE_API_KEY;
    });
  });

  describe('Configuration Commands', () => {
    test('should create example configuration', () => {
      const result = config.createExample();
      expect(result).toBe(true);
      
      const examplePath = path.join(os.homedir(), '.visairerc.example');
      expect(fs.pathExistsSync(examplePath)).toBe(true);
      
      // Clean up
      fs.removeSync(examplePath);
    });

    test('should reset configuration', async () => {
      // Create a config file first
      await fs.writeJson(testConfigPath, { defaultProvider: 'claude' });
      expect(fs.pathExistsSync(testConfigPath)).toBe(true);
      
      const result = config.reset();
      expect(result).toBe(true);
      expect(fs.pathExistsSync(testConfigPath)).toBe(false);
    });

    test('should handle reset when no config exists', () => {
      const result = config.reset();
      expect(result).toBe(true);
    });
  });

  describe('Configuration Merging', () => {
    test('should merge CLI options with file config', () => {
      // Save base config
      config.save({
        defaultProvider: 'claude',
        timeout: 30000,
        agent: { enabled: true }
      });
      
      const cliOptions = {
        defaultProvider: 'gpt', // Override
        maxRetries: 5 // Add new
      };
      
      const finalConfig = config.getConfig(cliOptions);
      
      expect(finalConfig.defaultProvider).toBe('gpt'); // CLI override
      expect(finalConfig.timeout).toBe(30000); // From file
      expect(finalConfig.maxRetries).toBe(5); // From CLI
      expect(finalConfig.agent.enabled).toBe(true); // From file
    });

    test('should handle empty CLI options', () => {
      config.save({ defaultProvider: 'claude' });
      
      const finalConfig = config.getConfig({});
      
      expect(finalConfig.defaultProvider).toBe('claude');
    });
  });

  describe('Configuration Display', () => {
    test('should display current configuration', () => {
      // Mock console.log to capture output
      const originalLog = console.log;
      const logOutput = [];
      console.log = (...args) => logOutput.push(args.join(' '));
      
      config.save({ defaultProvider: 'claude', timeout: 45000 });
      config.display();
      
      // Restore console.log
      console.log = originalLog;
      
      expect(logOutput.some(line => line.includes('defaultProvider: claude'))).toBe(true);
      expect(logOutput.some(line => line.includes('timeout: 45000'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle file system errors gracefully', () => {
      // Try to set config path to invalid location
      config.configPath = '/invalid/path/that/does/not/exist/.visairerc';
      
      const result = config.set('defaultProvider', 'claude');
      expect(result).toBe(false);
    });

    test('should handle invalid JSON in config file', async () => {
      await fs.writeFile(testConfigPath, '{ invalid json }');
      
      const loadedConfig = config.load();
      
      // Should return defaults
      expect(loadedConfig.defaultProvider).toBeNull();
    });
  });
});