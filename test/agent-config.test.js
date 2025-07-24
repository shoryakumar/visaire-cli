const Config = require('../lib/config');
const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Test agent configuration behavior
 */
describe('Agent Configuration Compatibility', () => {
  let testConfigPath;
  let originalConfigPath;
  let config;

  beforeEach(() => {
    // Create a temporary config file for testing
    testConfigPath = path.join(os.tmpdir(), '.visairerc-agent-test-' + Date.now());
    config = new Config();
    
    // Backup original config path
    originalConfigPath = config.configPath;
    config.configPath = testConfigPath;
  });

  afterEach(() => {
    // Cleanup test config file
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    
    // Restore original config path
    if (config) {
      config.configPath = originalConfigPath;
    }
  });

  test('should respect agent.enabled = false in config', () => {
    // Create config with agent disabled
    const testConfig = {
      defaultProvider: 'claude',
      agent: {
        enabled: false,
        confirmationEnabled: false,
        autoApprove: true,
        maxActionsPerPrompt: 10
      }
    };

    // Save config
    const success = config.save(testConfig);
    expect(success).toBe(true);

    // Load config and verify agent is disabled
    const loadedConfig = config.load();
    expect(loadedConfig.agent.enabled).toBe(false);
  });

  test('should default to agent disabled when not specified', () => {
    // Create config without agent.enabled
    const testConfig = {
      defaultProvider: 'claude',
      agent: {
        confirmationEnabled: false,
        autoApprove: true,
        maxActionsPerPrompt: 10
      }
    };

    // Save config
    const success = config.save(testConfig);
    expect(success).toBe(true);

    // Load config and verify agent defaults to disabled
    const loadedConfig = config.load();
    expect(loadedConfig.agent.enabled).toBe(false); // Should use default (false)
  });

  test('should respect agent.enabled = true in config', () => {
    // Create config with agent explicitly enabled
    const testConfig = {
      defaultProvider: 'claude',
      agent: {
        enabled: true,
        confirmationEnabled: false,
        autoApprove: true,
        maxActionsPerPrompt: 10
      }
    };

    // Save config
    const success = config.save(testConfig);
    expect(success).toBe(true);

    // Load config and verify agent is enabled
    const loadedConfig = config.load();
    expect(loadedConfig.agent.enabled).toBe(true);
  });

  test('should handle missing agent section in config', () => {
    // Create config without agent section
    const testConfig = {
      defaultProvider: 'claude',
      timeout: 30000
    };

    // Save config
    const success = config.save(testConfig);
    expect(success).toBe(true);

    // Load config and verify agent defaults are applied
    const loadedConfig = config.load();
    expect(loadedConfig.agent).toBeDefined();
    expect(loadedConfig.agent.enabled).toBe(false); // Should use default (false)
  });

  test('should allow setting agent.enabled via config.set', () => {
    // Start with default config
    config.save({});

    // Disable agent via config.set
    const success = config.set('agent.enabled', false);
    expect(success).toBe(true);

    // Verify agent is disabled
    const value = config.get('agent.enabled');
    expect(value).toBe(false);
  });

  test('should allow enabling agent via config.set', () => {
    // Start with agent disabled
    config.save({
      agent: { enabled: false }
    });

    // Enable agent via config.set
    const success = config.set('agent.enabled', true);
    expect(success).toBe(true);

    // Verify agent is enabled
    const value = config.get('agent.enabled');
    expect(value).toBe(true);
  });
});