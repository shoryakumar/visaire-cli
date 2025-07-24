const InteractiveSession = require('../lib/InteractiveSession');
const Config = require('../lib/config');
const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Test interactive mode agent configuration behavior
 */
describe('Interactive Mode Agent Configuration', () => {
  let testConfigPath;
  let originalConfigPath;
  let config;
  let session;

  beforeEach(() => {
    // Create a temporary config file for testing
    testConfigPath = path.join(os.tmpdir(), '.visairerc-interactive-test-' + Date.now());
    config = new Config();
    
    // Backup original config path
    originalConfigPath = config.configPath;
    config.configPath = testConfigPath;
  });

  afterEach(async () => {
    // Cleanup session
    if (session) {
      try {
        await session.stop();
      } catch (error) {
        // Ignore cleanup errors
      }
      session = null;
    }

    // Cleanup test config file
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    
    // Restore original config path
    if (config) {
      config.configPath = originalConfigPath;
    }
  });

  test('should initialize with agent disabled by default', () => {
    const testConfig = config.load(); // Uses defaults
    const options = {
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000,
      temperature: 0.7
    };

    session = new InteractiveSession(testConfig, 'claude', 'test-key', options);

    expect(session.agentEnabled).toBe(false);
    expect(session.agent).toBeNull();
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

    config.save(testConfig);
    const loadedConfig = config.load();

    const options = {
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000,
      temperature: 0.7
    };

    session = new InteractiveSession(loadedConfig, 'claude', 'test-key', options);

    expect(session.agentEnabled).toBe(false);
    expect(session.agent).toBeNull();
  });

  test('should respect --no-agent CLI option', () => {
    const testConfig = config.load(); // Uses defaults (agent enabled)
    const options = {
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000,
      temperature: 0.7,
      agent: false // CLI --no-agent flag
    };

    session = new InteractiveSession(testConfig, 'claude', 'test-key', options);

    expect(session.agentEnabled).toBe(false);
    expect(session.agent).toBeNull();
  });

  test('should enable agent when config has agent.enabled = true', () => {
    // Create config with agent enabled
    const testConfig = {
      defaultProvider: 'claude',
      agent: {
        enabled: true,
        confirmationEnabled: false,
        autoApprove: true,
        maxActionsPerPrompt: 10
      }
    };

    config.save(testConfig);
    const loadedConfig = config.load();

    const options = {
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000,
      temperature: 0.7
      // No agent option - should use config default
    };

    session = new InteractiveSession(loadedConfig, 'claude', 'test-key', options);

    expect(session.agentEnabled).toBe(true);
    expect(session.agent).toBeDefined();
    expect(session.agent).not.toBeNull();
  });

  test('should enable agent when explicitly set to true', () => {
    const testConfig = config.load(); // Uses defaults
    const options = {
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000,
      temperature: 0.7,
      agent: true // Explicitly enabled
    };

    session = new InteractiveSession(testConfig, 'claude', 'test-key', options);

    expect(session.agentEnabled).toBe(true);
    expect(session.agent).toBeDefined();
    expect(session.agent).not.toBeNull();
  });

  test('CLI option should override config file', () => {
    // Create config with agent enabled
    const testConfig = {
      defaultProvider: 'claude',
      agent: {
        enabled: true,
        confirmationEnabled: false,
        autoApprove: true,
        maxActionsPerPrompt: 10
      }
    };

    config.save(testConfig);
    const loadedConfig = config.load();

    const options = {
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000,
      temperature: 0.7,
      agent: false // CLI --no-agent should override config
    };

    session = new InteractiveSession(loadedConfig, 'claude', 'test-key', options);

    expect(session.agentEnabled).toBe(false);
    expect(session.agent).toBeNull();
  });

  test('should handle missing agent section in config', () => {
    // Create config without agent section
    const testConfig = {
      defaultProvider: 'claude',
      timeout: 30000
    };

    config.save(testConfig);
    const loadedConfig = config.load();

    const options = {
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000,
      temperature: 0.7
    };

    session = new InteractiveSession(loadedConfig, 'claude', 'test-key', options);

    // Should default to disabled
    expect(session.agentEnabled).toBe(false);
    expect(session.agent).toBeNull();
  });
});