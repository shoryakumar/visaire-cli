const EnhancedAgent = require('../lib/EnhancedAgent');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('EnhancedAgent', () => {
  let agent;
  let testDir;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(os.tmpdir(), 'visaire-test-' + Date.now());
    await fs.ensureDir(testDir);
    
    // Initialize enhanced agent with test configuration
    agent = new EnhancedAgent({
      provider: 'claude',
      model: 'claude-3-sonnet-20240229',
      apiKey: 'test-key',
      effort: 'low',
      autoApprove: true,
      confirmationRequired: false,
      logLevel: 'error', // Suppress logs during tests
      security: {
        allowedPaths: [testDir],
        blockedCommands: ['rm -rf', 'sudo'],
        maxFileSize: 1048576,
        sandboxMode: true
      }
    });
  });

  afterEach(async () => {
    // Cleanup
    if (agent) {
      await agent.shutdown();
    }
    
    if (testDir && await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(agent).toBeDefined();
      expect(agent.config).toBeDefined();
      expect(agent.config.name).toBe('visaire-enhanced-agent');
    });

    it('should have core components initialized', () => {
      expect(agent.toolRegistry).toBeDefined();
      expect(agent.conversationManager).toBeDefined();
      expect(agent.reasoningEngine).toBeDefined();
      expect(agent.contextManager).toBeDefined();
      expect(agent.logger).toBeDefined();
    });

    it('should have default tools registered', () => {
      const tools = agent.toolRegistry.tools;
      expect(tools.has('filesystem')).toBe(true);
      expect(tools.has('exec')).toBe(true);
      expect(tools.has('network')).toBe(true);
      expect(tools.has('analysis')).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate effort levels', () => {
      expect(() => {
        new EnhancedAgent({ effort: 'invalid' });
      }).toThrow();
    });

    it('should validate provider options', () => {
      expect(() => {
        new EnhancedAgent({ provider: 'invalid' });
      }).toThrow();
    });

    it('should handle security configuration', () => {
      const secureAgent = new EnhancedAgent({
        security: {
          allowedPaths: ['/safe/path'],
          blockedCommands: ['dangerous-command'],
          maxFileSize: 1024,
          sandboxMode: true
        }
      });
      
      expect(secureAgent.config.security.sandboxMode).toBe(true);
      expect(secureAgent.config.security.maxFileSize).toBe(1024);
    });
  });

  describe('Event Handling', () => {
    it('should emit events during processing', (done) => {
      agent.once('processing:start', () => {
        done();
      });
      
      // Trigger an event
      agent.emit('processing:start');
    });

    it('should handle shutdown gracefully', async () => {
      const shutdownPromise = agent.shutdown();
      await expect(shutdownPromise).resolves.toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid prompts gracefully', async () => {
      const result1 = await agent.processPrompt('');
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('Prompt is required');
      
      const result2 = await agent.processPrompt(null);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Prompt is required');
      
      const result3 = await agent.processPrompt(123);
      expect(result3.success).toBe(false);
      expect(result3.error).toContain('Prompt is required');
    });

    it('should handle missing API key gracefully', async () => {
      const noKeyAgent = new EnhancedAgent({
        provider: 'claude',
        apiKey: null,
        logLevel: 'error'
      });
      
      // Should handle missing API key gracefully
      const result = await noKeyAgent.processPrompt('test');
      expect(result.success).toBe(false);
      
      await noKeyAgent.shutdown();
    });
  });
});