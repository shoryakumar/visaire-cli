const Agent = require('../lib/agent');
const ToolRegistry = require('../lib/tools');
const Logger = require('../lib/logger');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('Agent', () => {
  let agent;
  let testDir;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(os.tmpdir(), 'visaire-test-' + Date.now());
    await fs.ensureDir(testDir);
    
    // Initialize agent with test configuration
    agent = new Agent({
      confirmationEnabled: false,
      autoApprove: true,
      maxActionsPerPrompt: 5,
      logger: { baseDir: testDir }
    });
    
    // Wait a bit for logger initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Clean up test directory
    if (testDir && await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
    
    if (agent) {
      await agent.endSession();
    }
  });

  describe('Action Detection', () => {
    test('should detect file creation actions', () => {
      const prompt = 'Create a file called test.js';
      const response = 'I\'ll create a file called test.js with some code.';
      
      const actions = agent.detectActions(prompt, response);
      
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('createFile');
      expect(actions[0].tool).toBe('filesystem');
      expect(actions[0].method).toBe('writeFile');
      expect(actions[0].params[0]).toBe('test.js');
    });

    test('should detect shell command actions', () => {
      const prompt = 'Run the command "ls -la"';
      const response = 'I\'ll run ls -la for you.';
      
      const actions = agent.detectActions(prompt, response);
      
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('runCommand');
      expect(actions[0].tool).toBe('exec');
      expect(actions[0].method).toBe('executeCommand');
      expect(actions[0].params[0]).toBe('ls -la');
    });

    test('should detect directory creation actions', () => {
      const prompt = 'Create a directory called src';
      const response = 'I\'ll create a directory called src.';
      
      const actions = agent.detectActions(prompt, response);
      
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('createDirectory');
      expect(actions[0].tool).toBe('filesystem');
      expect(actions[0].method).toBe('mkdir');
      expect(actions[0].params[0]).toBe('src');
    });

    test('should extract code from code blocks', () => {
      const prompt = 'Create a file called app.js';
      const response = `I'll create app.js with this code:
\`\`\`javascript
console.log('Hello World');
\`\`\``;
      
      const actions = agent.detectActions(prompt, response);
      
      expect(actions).toHaveLength(1);
      expect(actions[0].params[1]).toBe('console.log(\'Hello World\');');
    });

    test('should handle multiple actions', () => {
      const prompt = 'Create a file called test.js and run npm install';
      const response = 'I\'ll create test.js and then run npm install.';
      
      const actions = agent.detectActions(prompt, response);
      
      expect(actions.length).toBeGreaterThan(1);
    });
  });

  describe('Action Validation', () => {
    test('should validate safe actions', async () => {
      const actions = [{
        id: '1',
        type: 'createFile',
        tool: 'filesystem',
        method: 'writeFile',
        params: ['test.txt', 'content'],
        confidence: 0.9,
        destructive: false
      }];
      
      const validActions = await agent.validateActions(actions);
      
      expect(validActions).toHaveLength(1);
      expect(validActions[0].id).toBe('1');
    });

    test('should reject invalid tool operations', async () => {
      const actions = [{
        id: '1',
        type: 'invalidAction',
        tool: 'nonexistent',
        method: 'invalidMethod',
        params: [],
        confidence: 0.9,
        destructive: false
      }];
      
      const validActions = await agent.validateActions(actions);
      
      expect(validActions).toHaveLength(0);
    });
  });

  describe('Agent Configuration', () => {
    test('should configure agent settings', () => {
      agent.configure({
        confirmationEnabled: true,
        autoApprove: false,
        maxActionsPerPrompt: 3
      });
      
      const status = agent.getStatus();
      
      expect(status.settings.confirmationEnabled).toBe(true);
      expect(status.settings.autoApprove).toBe(false);
      expect(status.settings.maxActionsPerPrompt).toBe(3);
    });

    test('should get agent status', () => {
      const status = agent.getStatus();
      
      expect(status).toHaveProperty('ready');
      expect(status).toHaveProperty('tools');
      expect(status).toHaveProperty('settings');
      expect(status).toHaveProperty('currentSession');
    });
  });

  describe('Full Integration', () => {
    test('should process prompt and execute actions', async () => {
      const testFile = path.join(testDir, 'integration-test.txt');
      const prompt = 'Create a file called integration-test.txt';
      const response = 'I\'ll create integration-test.txt with some content.';
      
      // Change to test directory for relative path resolution
      const originalCwd = process.cwd();
      process.chdir(testDir);
      
      try {
        const result = await agent.processPrompt(prompt, response);
        
        expect(result.success).toBe(true);
        expect(result.executed).toBe(true);
        expect(result.results).toBeDefined();
        
        // Verify file was actually created
        const fileExists = await fs.pathExists(testFile);
        expect(fileExists).toBe(true);
      } finally {
        // Restore original working directory
        process.chdir(originalCwd);
      }
    }, 10000);
  });
});

describe('ToolRegistry', () => {
  let toolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  test('should initialize with default tools', () => {
    const tools = toolRegistry.getAvailableTools();
    
    expect(tools).toContain('filesystem');
    expect(tools).toContain('exec');
  });

  test('should execute filesystem operations', async () => {
    const result = await toolRegistry.executeTool('filesystem', 'exists', [__filename]);
    
    expect(result.success).toBe(true);
    expect(result.result.exists).toBe(true);
  });

  test('should validate operations before execution', () => {
    const validation = toolRegistry.validateOperation('filesystem', 'readFile', ['test.txt']);
    
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should reject invalid operations', () => {
    const validation = toolRegistry.validateOperation('nonexistent', 'invalidMethod', []);
    
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });
});

describe('Logger', () => {
  let logger;
  let testDir;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'visaire-logger-test-' + Date.now());
    await fs.ensureDir(testDir);
    
    logger = new Logger({ baseDir: testDir });
    await logger.initializeLogging();
  });

  afterEach(async () => {
    if (testDir && await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  test('should log prompts and responses', async () => {
    const conversationId = await logger.logPrompt('test prompt');
    await logger.logResponse(conversationId, 'test response');
    
    const history = await logger.getHistory(1);
    
    expect(history).toHaveLength(1);
    expect(history[0].prompt).toContain('test prompt');
    expect(history[0].response.content).toContain('test response');
  });

  test('should log agent actions', async () => {
    const actionId = await logger.logAction('filesystem', 'writeFile', {
      path: 'test.txt',
      success: true
    });
    
    expect(actionId).toBeDefined();
    
    const stats = await logger.getSessionStats();
    expect(stats.totalActions).toBe(1);
    expect(stats.toolsUsed).toContain('filesystem');
  });

  test('should clean old logs', async () => {
    await logger.logPrompt('old prompt');
    await logger.cleanOldLogs(0); // Remove everything
    
    const history = await logger.getHistory();
    expect(history).toHaveLength(0);
  });
});