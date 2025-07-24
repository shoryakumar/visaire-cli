const FilesystemTool = require('./filesystem');
const ExecTool = require('./exec');
const Utils = require('../utils');

/**
 * Central tool registry and coordinator for the agent
 */
class ToolRegistry {
  constructor(logger = null) {
    this.logger = logger;
    this.tools = new Map();
    this.initialized = false;
    
    // Initialize default tools
    this.initializeDefaultTools();
  }

  /**
   * Initialize default tools
   */
  initializeDefaultTools() {
    try {
      // Register filesystem tool
      const filesystemTool = new FilesystemTool(this.logger);
      this.registerTool(filesystemTool.name, filesystemTool);

      // Register exec tool
      const execTool = new ExecTool(this.logger);
      this.registerTool(execTool.name, execTool);

      this.initialized = true;
      
      if (this.logger) {
        this.logger.logAction('toolRegistry', 'initialized', {
          tools: Array.from(this.tools.keys()),
          count: this.tools.size
        });
      }
    } catch (error) {
      Utils.logError(`Failed to initialize tools: ${error.message}`);
      throw error;
    }
  }

  /**
   * Register a new tool
   */
  registerTool(name, tool) {
    if (!name || !tool) {
      throw new Error('Tool name and instance are required');
    }

    if (this.tools.has(name)) {
      Utils.logWarning(`Tool '${name}' is already registered, overwriting`);
    }

    this.tools.set(name, tool);
    
    if (this.logger) {
      this.logger.logAction('toolRegistry', 'registerTool', {
        name,
        methods: tool.getMethods ? tool.getMethods() : []
      });
    }
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name) {
    if (!this.tools.has(name)) {
      throw new Error(`Tool '${name}' is not registered`);
    }

    this.tools.delete(name);
    
    if (this.logger) {
      this.logger.logAction('toolRegistry', 'unregisterTool', { name });
    }
  }

  /**
   * Get a tool by name
   */
  getTool(name) {
    if (!this.tools.has(name)) {
      throw new Error(`Tool '${name}' is not registered`);
    }

    return this.tools.get(name);
  }

  /**
   * Check if tool exists
   */
  hasTool(name) {
    return this.tools.has(name);
  }

  /**
   * Get all available tools
   */
  getAvailableTools() {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool descriptions for agent
   */
  getToolDescriptions() {
    const descriptions = {};
    
    for (const [name, tool] of this.tools) {
      if (tool.getDescription) {
        descriptions[name] = tool.getDescription();
      } else {
        descriptions[name] = {
          name,
          description: 'No description available',
          methods: tool.getMethods ? tool.getMethods() : []
        };
      }
    }

    return descriptions;
  }

  /**
   * Execute tool method
   */
  async executeTool(toolName, methodName, args = [], options = {}) {
    try {
      if (!this.hasTool(toolName)) {
        throw new Error(`Tool '${toolName}' is not available`);
      }

      const tool = this.getTool(toolName);
      
      if (!tool[methodName] || typeof tool[methodName] !== 'function') {
        throw new Error(`Method '${methodName}' not found in tool '${toolName}'`);
      }

      const startTime = Date.now();
      
      if (this.logger) {
        this.logger.logAction('toolRegistry', 'executeTool', {
          tool: toolName,
          method: methodName,
          argsCount: args.length,
          started: new Date().toISOString()
        });
      }

      // Execute the tool method
      const result = await tool[methodName](...args);
      
      const executionTime = Date.now() - startTime;

      if (this.logger) {
        this.logger.logAction('toolRegistry', 'executeTool', {
          tool: toolName,
          method: methodName,
          success: result?.success !== false,
          executionTime
        });
      }

      return {
        success: true,
        tool: toolName,
        method: methodName,
        result,
        executionTime
      };
    } catch (error) {
      if (this.logger) {
        this.logger.logAction('toolRegistry', 'executeTool', {
          tool: toolName,
          method: methodName,
          success: false,
          error: error.message
        });
      }

      return {
        success: false,
        tool: toolName,
        method: methodName,
        error: error.message
      };
    }
  }

  /**
   * Execute multiple tool operations in sequence
   */
  async executeSequence(operations) {
    const results = [];
    
    for (const operation of operations) {
      const { tool, method, args = [], options = {} } = operation;
      
      try {
        const result = await this.executeTool(tool, method, args, options);
        results.push(result);
        
        // Stop on first failure unless continueOnError is true
        if (!result.success && !options.continueOnError) {
          break;
        }
      } catch (error) {
        results.push({
          success: false,
          tool,
          method,
          error: error.message
        });
        
        if (!options.continueOnError) {
          break;
        }
      }
    }

    return {
      success: results.every(r => r.success),
      results,
      completed: results.length,
      total: operations.length
    };
  }

  /**
   * Execute multiple tool operations in parallel
   */
  async executeParallel(operations, options = {}) {
    const maxConcurrency = options.maxConcurrency || 3;
    const results = [];
    
    // Split operations into batches
    const batches = [];
    for (let i = 0; i < operations.length; i += maxConcurrency) {
      batches.push(operations.slice(i, i + maxConcurrency));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(operation => {
        const { tool, method, args = [], options = {} } = operation;
        return this.executeTool(tool, method, args, options);
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            error: result.reason.message || 'Unknown error'
          });
        }
      }
    }

    return {
      success: results.every(r => r.success),
      results,
      completed: results.length,
      total: operations.length
    };
  }

  /**
   * Validate tool operation before execution
   */
  validateOperation(toolName, methodName, args = []) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check if tool exists
    if (!this.hasTool(toolName)) {
      validation.valid = false;
      validation.errors.push(`Tool '${toolName}' is not available`);
      return validation;
    }

    const tool = this.getTool(toolName);

    // Check if method exists
    if (!tool[methodName] || typeof tool[methodName] !== 'function') {
      validation.valid = false;
      validation.errors.push(`Method '${methodName}' not found in tool '${toolName}'`);
      return validation;
    }

    // Tool-specific validations
    if (toolName === 'exec') {
      // Validate shell commands
      if (methodName === 'executeCommand' && args.length > 0) {
        const command = args[0];
        const safetyCheck = tool.isCommandSafe(command);
        if (!safetyCheck.safe) {
          validation.valid = false;
          validation.errors.push(safetyCheck.reason);
        }
      }
    }

    if (toolName === 'filesystem') {
      // Validate file paths
      if (args.length > 0 && typeof args[0] === 'string') {
        const filePath = args[0];
        if (filePath.includes('..')) {
          validation.warnings.push('Path contains ".." which may access parent directories');
        }
        if (filePath.startsWith('/')) {
          validation.warnings.push('Using absolute path - ensure this is intended');
        }
      }
    }

    return validation;
  }

  /**
   * Get tool usage statistics
   */
  getUsageStats() {
    const stats = {
      totalTools: this.tools.size,
      tools: {}
    };

    for (const [name, tool] of this.tools) {
      stats.tools[name] = {
        name,
        methods: tool.getMethods ? tool.getMethods().length : 0,
        description: tool.description || 'No description'
      };
    }

    return stats;
  }

  /**
   * Reset all tools
   */
  reset() {
    this.tools.clear();
    this.initialized = false;
    this.initializeDefaultTools();
    
    if (this.logger) {
      this.logger.logAction('toolRegistry', 'reset', {
        tools: Array.from(this.tools.keys())
      });
    }
  }

  /**
   * Configure tool settings
   */
  configureTool(toolName, settings) {
    if (!this.hasTool(toolName)) {
      throw new Error(`Tool '${toolName}' is not available`);
    }

    const tool = this.getTool(toolName);
    
    if (tool.configureSecurity && toolName === 'exec') {
      tool.configureSecurity(settings);
    }

    if (this.logger) {
      this.logger.logAction('toolRegistry', 'configureTool', {
        tool: toolName,
        settings: Object.keys(settings)
      });
    }
  }

  /**
   * Get tool status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      toolCount: this.tools.size,
      tools: this.getAvailableTools(),
      ready: this.initialized && this.tools.size > 0
    };
  }
}

module.exports = ToolRegistry;