const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const fs = require('fs-extra');
const path = require('path');

// Import tool implementations
const FilesystemTool = require('../tools/FilesystemTool');
const ExecTool = require('../tools/ExecTool');
const NetworkTool = require('../tools/NetworkTool');
const AnalysisTool = require('../tools/AnalysisTool');

/**
 * Enhanced tool registry with JSON schema validation, sophisticated execution pipeline,
 * and Forge-style tool management
 */
class ToolRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.logger = options.logger;
    this.security = options.security || {};
    this.maxConcurrent = options.maxConcurrent || 3;
    
    // Tool storage and state
    this.tools = new Map();
    this.toolSchemas = new Map();
    this.executionQueue = [];
    this.runningExecutions = new Map();
    this.executionHistory = [];
    
    // Configuration
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      enableValidation: true,
      enableMetrics: true,
      enableSandbox: options.security?.sandboxMode || false
    };
    
    // Metrics
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      toolUsageStats: new Map()
    };
    
    // Initialize default tools
    this.initializeDefaultTools();
  }

  /**
   * Initialize default tools with schemas
   */
  async initializeDefaultTools() {
    try {
      // Filesystem tool
      const filesystemTool = new FilesystemTool({
        logger: this.logger,
        security: this.security
      });
      await this.registerTool('filesystem', filesystemTool, this.getFilesystemSchema());

      // Execution tool
      const execTool = new ExecTool({
        logger: this.logger,
        security: this.security
      });
      await this.registerTool('exec', execTool, this.getExecSchema());

      // Network tool
      const networkTool = new NetworkTool({
        logger: this.logger,
        security: this.security
      });
      await this.registerTool('network', networkTool, this.getNetworkSchema());

      // Analysis tool
      const analysisTool = new AnalysisTool({
        logger: this.logger
      });
      await this.registerTool('analysis', analysisTool, this.getAnalysisSchema());

      if (this.logger) {
        this.logger.info('Default tools initialized', {
          tools: Array.from(this.tools.keys()),
          count: this.tools.size
        });
      }

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to initialize default tools', { error: error.message });
      }
      throw error;
    }
  }

  /**
   * Register a tool with JSON schema validation
   */
  async registerTool(name, tool, schema = null) {
    const registrationSchema = Joi.object({
      name: Joi.string().required(),
      tool: Joi.object().required(),
      schema: Joi.object().optional()
    });

    const { error } = registrationSchema.validate({ name, tool, schema });
    if (error) {
      throw new Error(`Tool registration validation failed: ${error.details[0].message}`);
    }

    // Validate tool interface
    if (!tool.execute || typeof tool.execute !== 'function') {
      throw new Error(`Tool ${name} must implement execute method`);
    }

    // Store tool and schema
    this.tools.set(name, {
      instance: tool,
      name,
      schema,
      registeredAt: new Date().toISOString(),
      metadata: tool.getMetadata ? tool.getMetadata() : {}
    });

    if (schema) {
      this.toolSchemas.set(name, schema);
    }

    // Initialize metrics for this tool
    this.metrics.toolUsageStats.set(name, {
      executions: 0,
      successes: 0,
      failures: 0,
      totalTime: 0,
      averageTime: 0
    });

    if (this.logger) {
      this.logger.info('Tool registered', {
        name,
        hasSchema: !!schema,
        metadata: tool.getMetadata ? tool.getMetadata() : {}
      });
    }

    this.emit('tool:registered', { name, tool, schema });
  }

  /**
   * Validate action against tool schema
   */
  async validateAction(action) {
    const actionSchema = Joi.object({
      id: Joi.string().optional(),
      type: Joi.string().required(),
      tool: Joi.string().required(),
      method: Joi.string().required(),
      parameters: Joi.array().default([]),
      args: Joi.array().default([]), // Support both parameters and args
      options: Joi.object().default({}),
      metadata: Joi.object().default({}),
      timestamp: Joi.string().optional()
    });

    // Validate action structure
    const { error: structureError, value } = actionSchema.validate(action);
    if (structureError) {
      return {
        valid: false,
        errors: [`Action structure invalid: ${structureError.details[0].message}`],
        warnings: []
      };
    }

    // Normalize args to parameters for internal use
    if (value.args && !value.parameters) {
      value.parameters = value.args;
    }

    // Check if tool exists
    if (!this.tools.has(value.tool)) {
      return {
        valid: false,
        errors: [`Tool '${value.tool}' is not registered`],
        warnings: []
      };
    }

    const toolInfo = this.tools.get(value.tool);
    const tool = toolInfo.instance;

    // Check if method exists
    if (!tool[value.method] || typeof tool[value.method] !== 'function') {
      return {
        valid: false,
        errors: [`Method '${value.method}' not found in tool '${value.tool}'`],
        warnings: []
      };
    }

    // Validate against tool schema if available
    const validation = { valid: true, errors: [], warnings: [] };
    
    if (toolInfo.schema && toolInfo.schema.methods && toolInfo.schema.methods[value.method]) {
      const methodSchema = toolInfo.schema.methods[value.method];
      
      if (methodSchema.parameters) {
        const paramValidation = methodSchema.parameters.validate(value.parameters);
        if (paramValidation.error) {
          validation.valid = false;
          validation.errors.push(`Parameter validation failed: ${paramValidation.error.details[0].message}`);
        }
      }
    }

    // Tool-specific validation
    if (tool.validateAction && typeof tool.validateAction === 'function') {
      try {
        const toolValidation = await tool.validateAction(value);
        if (!toolValidation.valid) {
          validation.valid = false;
          validation.errors.push(...toolValidation.errors);
        }
        validation.warnings.push(...(toolValidation.warnings || []));
      } catch (error) {
        validation.valid = false;
        validation.errors.push(`Tool validation failed: ${error.message}`);
      }
    }

    return validation;
  }

  /**
   * Execute action with comprehensive error handling and metrics
   */
  async executeAction(action, options = {}) {
    const executionId = uuidv4();
    const startTime = Date.now();

    try {
      // Validate action
      if (this.config.enableValidation) {
        const validation = await this.validateAction(action);
        if (!validation.valid) {
          throw new Error(`Action validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Check concurrent execution limits
      if (this.runningExecutions.size >= this.maxConcurrent) {
        await this.waitForSlot();
      }

      // Add to running executions
      this.runningExecutions.set(executionId, {
        action,
        startTime,
        options
      });

      this.emit('tool:start', {
        executionId,
        action,
        timestamp: new Date().toISOString()
      });

      if (this.logger) {
        this.logger.debug('Tool execution started', {
          executionId,
          tool: action.tool,
          method: action.method,
          parameters: action.parameters
        });
      }

      // Get tool instance
      const toolInfo = this.tools.get(action.tool);
      const tool = toolInfo.instance;

      // Execute with timeout
      const result = await this.executeWithTimeout(
        tool[action.method].bind(tool),
        action.parameters,
        options.timeout || this.config.timeout
      );

      // Calculate execution time
      const executionTime = Date.now() - startTime;

      // Update metrics
      this.updateMetrics(action.tool, true, executionTime);

      // Create execution record
      const executionRecord = {
        id: executionId,
        action,
        result,
        success: true,
        executionTime,
        timestamp: new Date().toISOString(),
        options
      };

      // Store in history
      this.executionHistory.push(executionRecord);
      if (this.executionHistory.length > 1000) {
        this.executionHistory = this.executionHistory.slice(-500);
      }

      // Remove from running executions
      this.runningExecutions.delete(executionId);

      this.emit('tool:complete', executionRecord);

      if (this.logger) {
        this.logger.info('Tool execution completed', {
          executionId,
          tool: action.tool,
          method: action.method,
          executionTime,
          success: true
        });
      }

      return {
        success: true,
        result,
        executionTime,
        executionId,
        metadata: {
          tool: action.tool,
          method: action.method,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(action.tool, false, executionTime);

      // Create error record
      const errorRecord = {
        id: executionId,
        action,
        error: error.message,
        success: false,
        executionTime,
        timestamp: new Date().toISOString(),
        options
      };

      // Store in history
      this.executionHistory.push(errorRecord);

      // Remove from running executions
      this.runningExecutions.delete(executionId);

      this.emit('tool:error', errorRecord);

      if (this.logger) {
        this.logger.error('Tool execution failed', {
          executionId,
          tool: action.tool,
          method: action.method,
          error: error.message,
          executionTime
        });
      }

      return {
        success: false,
        error: error.message,
        executionTime,
        executionId,
        metadata: {
          tool: action.tool,
          method: action.method,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn, args, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeout}ms`));
      }, timeout);

      Promise.resolve(fn(...args))
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Wait for execution slot to become available
   */
  async waitForSlot() {
    return new Promise((resolve) => {
      const checkSlot = () => {
        if (this.runningExecutions.size < this.maxConcurrent) {
          resolve();
        } else {
          setTimeout(checkSlot, 100);
        }
      };
      checkSlot();
    });
  }

  /**
   * Execute multiple actions in sequence
   */
  async executeSequence(actions, options = {}) {
    const results = [];
    const { continueOnError = false, timeout = this.config.timeout } = options;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      try {
        const result = await this.executeAction(action, { timeout });
        results.push(result);
        
        if (!result.success && !continueOnError) {
          break;
        }
      } catch (error) {
        const errorResult = {
          success: false,
          error: error.message,
          action,
          index: i
        };
        results.push(errorResult);
        
        if (!continueOnError) {
          break;
        }
      }
    }

    return {
      success: results.every(r => r.success),
      results,
      summary: {
        total: actions.length,
        completed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    };
  }

  /**
   * Execute multiple actions in parallel
   */
  async executeParallel(actions, options = {}) {
    const { maxConcurrency = this.maxConcurrent, timeout = this.config.timeout } = options;
    
    // Split into batches
    const batches = [];
    for (let i = 0; i < actions.length; i += maxConcurrency) {
      batches.push(actions.slice(i, i + maxConcurrency));
    }

    const allResults = [];

    for (const batch of batches) {
      const batchPromises = batch.map(action => 
        this.executeAction(action, { timeout }).catch(error => ({
          success: false,
          error: error.message,
          action
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      allResults.push(...batchResults);
    }

    return {
      success: allResults.every(r => r.success),
      results: allResults,
      summary: {
        total: actions.length,
        successful: allResults.filter(r => r.success).length,
        failed: allResults.filter(r => !r.success).length
      }
    };
  }

  /**
   * Update execution metrics
   */
  updateMetrics(toolName, success, executionTime) {
    // Update global metrics
    this.metrics.totalExecutions++;
    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }

    // Update average execution time
    const totalTime = this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) + executionTime;
    this.metrics.averageExecutionTime = totalTime / this.metrics.totalExecutions;

    // Update tool-specific metrics
    if (this.metrics.toolUsageStats.has(toolName)) {
      const toolStats = this.metrics.toolUsageStats.get(toolName);
      toolStats.executions++;
      toolStats.totalTime += executionTime;
      toolStats.averageTime = toolStats.totalTime / toolStats.executions;
      
      if (success) {
        toolStats.successes++;
      } else {
        toolStats.failures++;
      }
    }
  }

  /**
   * Get tool schemas for documentation/validation
   */
  getToolSchemas() {
    const schemas = {};
    for (const [name, schema] of this.toolSchemas) {
      schemas[name] = schema;
    }
    return schemas;
  }

  /**
   * Get execution history
   */
  getExecutionHistory(options = {}) {
    const { limit = 50, tool = null, success = null } = options;
    
    let history = [...this.executionHistory];
    
    // Filter by tool
    if (tool) {
      history = history.filter(record => record.action.tool === tool);
    }
    
    // Filter by success status
    if (success !== null) {
      history = history.filter(record => record.success === success);
    }
    
    // Sort by timestamp (most recent first)
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return history.slice(0, limit);
  }

  /**
   * Stop all running executions
   */
  async stopAll() {
    const runningIds = Array.from(this.runningExecutions.keys());
    
    for (const id of runningIds) {
      try {
        // Attempt graceful cancellation
        const execution = this.runningExecutions.get(id);
        if (execution && execution.cancel) {
          await execution.cancel();
        }
        this.runningExecutions.delete(id);
      } catch (error) {
        if (this.logger) {
          this.logger.warn('Failed to stop execution', { id, error: error.message });
        }
      }
    }

    if (this.logger) {
      this.logger.info('All executions stopped', { count: runningIds.length });
    }
  }

  /**
   * Update tool registry configuration
   */
  async updateConfig(newConfig) {
    const configSchema = Joi.object({
      timeout: Joi.number().min(1000),
      retryAttempts: Joi.number().min(0).max(10),
      retryDelay: Joi.number().min(100),
      enableValidation: Joi.boolean(),
      enableMetrics: Joi.boolean(),
      enableSandbox: Joi.boolean(),
      maxConcurrent: Joi.number().min(1).max(20)
    });

    const { error, value } = configSchema.validate(newConfig);
    if (error) {
      throw new Error(`Configuration validation failed: ${error.details[0].message}`);
    }

    Object.assign(this.config, value);
    
    if (value.maxConcurrent) {
      this.maxConcurrent = value.maxConcurrent;
    }

    if (this.logger) {
      this.logger.info('Tool registry configuration updated', value);
    }
  }

  /**
   * Get registry status
   */
  getStatus() {
    return {
      toolCount: this.tools.size,
      runningExecutions: this.runningExecutions.size,
      queuedExecutions: this.executionQueue.length,
      metrics: { ...this.metrics },
      config: { ...this.config },
      tools: Array.from(this.tools.keys())
    };
  }

  /**
   * Get filesystem tool schema
   */
  getFilesystemSchema() {
    return {
      name: 'filesystem',
      description: 'File system operations',
      methods: {
        readFile: {
          description: 'Read file contents',
          parameters: Joi.array().items(
            Joi.string().required().description('File path')
          ).min(1).max(1)
        },
        writeFile: {
          description: 'Write content to file',
          parameters: Joi.array().items(
            Joi.string().required().description('File path'),
            Joi.string().required().description('Content')
          ).min(2).max(2)
        },
        createFile: {
          description: 'Create new file',
          parameters: Joi.array().items(
            Joi.string().required().description('File path'),
            Joi.string().default('').description('Initial content')
          ).min(1).max(2)
        },
        deleteFile: {
          description: 'Delete file',
          parameters: Joi.array().items(
            Joi.string().required().description('File path')
          ).min(1).max(1)
        },
        createDirectory: {
          description: 'Create directory',
          parameters: Joi.array().items(
            Joi.string().required().description('Directory path')
          ).min(1).max(1)
        },
        listDirectory: {
          description: 'List directory contents',
          parameters: Joi.array().items(
            Joi.string().default('.').description('Directory path')
          ).max(1)
        },
        copyFile: {
          description: 'Copy file',
          parameters: Joi.array().items(
            Joi.string().required().description('Source path'),
            Joi.string().required().description('Destination path')
          ).min(2).max(2)
        },
        moveFile: {
          description: 'Move/rename file',
          parameters: Joi.array().items(
            Joi.string().required().description('Source path'),
            Joi.string().required().description('Destination path')
          ).min(2).max(2)
        }
      }
    };
  }

  /**
   * Get exec tool schema
   */
  getExecSchema() {
    return {
      name: 'exec',
      description: 'Command execution operations',
      methods: {
        executeCommand: {
          description: 'Execute shell command',
          parameters: Joi.array().items(
            Joi.string().required().description('Command to execute'),
            Joi.object().default({}).description('Options')
          ).min(1).max(2)
        },
        installPackage: {
          description: 'Install npm package',
          parameters: Joi.array().items(
            Joi.string().required().description('Package name'),
            Joi.object().default({}).description('Options')
          ).min(1).max(2)
        },
        runScript: {
          description: 'Run npm script',
          parameters: Joi.array().items(
            Joi.string().required().description('Script name'),
            Joi.object().default({}).description('Options')
          ).min(1).max(2)
        }
      }
    };
  }

  /**
   * Get network tool schema
   */
  getNetworkSchema() {
    return {
      name: 'network',
      description: 'Network operations',
      methods: {
        httpRequest: {
          description: 'Make HTTP request',
          parameters: Joi.array().items(
            Joi.string().uri().required().description('URL'),
            Joi.object().default({}).description('Options')
          ).min(1).max(2)
        },
        downloadFile: {
          description: 'Download file from URL',
          parameters: Joi.array().items(
            Joi.string().uri().required().description('URL'),
            Joi.string().required().description('Destination path'),
            Joi.object().default({}).description('Options')
          ).min(2).max(3)
        }
      }
    };
  }

  /**
   * Get analysis tool schema
   */
  getAnalysisSchema() {
    return {
      name: 'analysis',
      description: 'Code and file analysis operations',
      methods: {
        analyzeCode: {
          description: 'Analyze code structure',
          parameters: Joi.array().items(
            Joi.string().required().description('File path'),
            Joi.object().default({}).description('Options')
          ).min(1).max(2)
        },
        findPattern: {
          description: 'Find pattern in files',
          parameters: Joi.array().items(
            Joi.string().required().description('Pattern'),
            Joi.string().default('.').description('Search directory'),
            Joi.object().default({}).description('Options')
          ).min(1).max(3)
        },
        getDependencies: {
          description: 'Get project dependencies',
          parameters: Joi.array().items(
            Joi.string().default('.').description('Project directory')
          ).max(1)
        }
      }
    };
  }
}

module.exports = ToolRegistry;