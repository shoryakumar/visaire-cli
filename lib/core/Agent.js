const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const Joi = require('joi');
const Logger = require('./Logger');
const ToolRegistry = require('./ToolRegistry');
const ConversationManager = require('./ConversationManager');
const ReasoningEngine = require('./ReasoningEngine');
const ContextManager = require('./ContextManager');

/**
 * Core Agent class implementing Forge-style sophisticated reasoning
 * This is the main orchestrator that coordinates all agent activities
 */
class Agent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Validate options
    const schema = Joi.object({
      id: Joi.string().optional(),
      name: Joi.string().default('visaire-agent'),
      model: Joi.string().default('claude-3-sonnet-20240229'),
      provider: Joi.string().valid('claude', 'gpt', 'gemini').default('claude'),
      apiKey: Joi.string().optional().allow(null),
      temperature: Joi.number().min(0).max(2).default(0.7),
      maxTokens: Joi.number().min(1).max(100000).default(4000),
      reasoning: Joi.object({
        effort: Joi.string().valid('low', 'medium', 'high', 'maximum').default('medium'),
        maxIterations: Joi.number().min(1).max(50).default(10),
        enableReflection: Joi.boolean().default(true),
        enablePlanning: Joi.boolean().default(true)
      }).default(),
      tools: Joi.object({
        enabled: Joi.boolean().default(true),
        autoApprove: Joi.boolean().default(false),
        confirmationRequired: Joi.boolean().default(true),
        maxConcurrent: Joi.number().min(1).max(10).default(3)
      }).default(),
      context: Joi.object({
        maxSize: Joi.number().min(1000).max(1000000).default(100000),
        compressionThreshold: Joi.number().min(0.1).max(1).default(0.8),
        retentionStrategy: Joi.string().valid('fifo', 'importance', 'recency').default('importance')
      }).default(),
      security: Joi.object({
        allowedPaths: Joi.array().items(Joi.string()).default(['./']),
        allowedCommands: Joi.array().items(Joi.string()).optional(),
        blockedCommands: Joi.array().items(Joi.string()).default(['rm -rf', 'sudo', 'format']),
        maxFileSize: Joi.number().min(1024).default(10485760), // 10MB
        maxExecutionTime: Joi.number().min(1000).optional(),
        maxOutputSize: Joi.number().min(1024).optional(),
        sandboxMode: Joi.boolean().default(false)
      }).default(),
      logging: Joi.object({
        level: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
        enableMetrics: Joi.boolean().default(true),
        enableTracing: Joi.boolean().default(false)
      }).default()
    }).unknown(true); // Allow unknown properties for flexibility

    const { error, value } = schema.validate(options);
    if (error) {
      throw new Error(`Invalid agent configuration: ${error.details[0].message}`);
    }

    // Initialize core properties
    this.id = value.id || uuidv4();
    this.name = value.name;
    this.config = value;
    this.state = 'idle'; // idle, thinking, acting, error
    this.startTime = new Date();
    this.metrics = {
      conversations: 0,
      toolCalls: 0,
      errors: 0,
      totalThinkingTime: 0,
      averageResponseTime: 0
    };

    // Initialize core components
    this.logger = new Logger({
      agentId: this.id,
      level: value.logging.level,
      enableMetrics: value.logging.enableMetrics,
      enableTracing: value.logging.enableTracing
    });

    this.toolRegistry = new ToolRegistry({
      logger: this.logger,
      security: value.security,
      maxConcurrent: value.tools.maxConcurrent
    });

    this.conversationManager = new ConversationManager({
      logger: this.logger,
      agentId: this.id
    });

    this.reasoningEngine = new ReasoningEngine({
      logger: this.logger,
      effort: value.reasoning.effort,
      maxIterations: value.reasoning.maxIterations,
      enableReflection: value.reasoning.enableReflection,
      enablePlanning: value.reasoning.enablePlanning
    });

    this.contextManager = new ContextManager({
      logger: this.logger,
      maxSize: value.context.maxSize,
      compressionThreshold: value.context.compressionThreshold,
      retentionStrategy: value.context.retentionStrategy
    });

    // Bind event handlers
    this.setupEventHandlers();

    this.logger.info('Agent initialized', {
      id: this.id,
      name: this.name,
      config: this.config
    });
  }

  /**
   * Setup event handlers for component coordination
   */
  setupEventHandlers() {
    // Tool execution events
    this.toolRegistry.on('tool:start', (data) => {
      this.emit('tool:start', data);
      this.logger.debug('Tool execution started', data);
    });

    this.toolRegistry.on('tool:complete', (data) => {
      this.metrics.toolCalls++;
      this.emit('tool:complete', data);
      this.logger.debug('Tool execution completed', data);
    });

    this.toolRegistry.on('tool:error', (data) => {
      this.metrics.errors++;
      this.emit('tool:error', data);
      this.logger.error('Tool execution failed', data);
    });

    // Reasoning events
    this.reasoningEngine.on('reasoning:start', (data) => {
      this.state = 'thinking';
      this.emit('reasoning:start', data);
    });

    this.reasoningEngine.on('reasoning:complete', (data) => {
      this.metrics.totalThinkingTime += data.duration || 0;
      this.emit('reasoning:complete', data);
    });

    // Conversation events
    this.conversationManager.on('conversation:start', (data) => {
      this.metrics.conversations++;
      this.emit('conversation:start', data);
    });

    this.conversationManager.on('conversation:end', (data) => {
      this.state = 'idle';
      this.emit('conversation:end', data);
    });
  }

  /**
   * Main entry point for processing user input
   * This implements the core agent reasoning loop
   */
  async processInput(input, options = {}) {
    const startTime = Date.now();
    const conversationId = uuidv4();

    try {
      this.logger.info('Processing input', { 
        conversationId, 
        inputLength: input.length,
        options 
      });

      // Start conversation
      const conversation = await this.conversationManager.startConversation({
        id: conversationId,
        input,
        options,
        agentId: this.id
      });

      // Build context for reasoning
      const context = await this.contextManager.buildContext({
        input,
        conversation,
        options
      });

      // Engage reasoning engine
      const reasoning = await this.reasoningEngine.process({
        input,
        context,
        conversation,
        config: this.config
      });

      // Execute any planned actions
      let executionResults = null;
      if (reasoning.actions && reasoning.actions.length > 0) {
        this.state = 'acting';
        executionResults = await this.executeActions(reasoning.actions, {
          conversationId,
          autoApprove: options.autoApprove || this.config.tools.autoApprove
        });
      }

      // Update conversation with results
      await this.conversationManager.updateConversation(conversationId, {
        reasoning,
        executionResults,
        metrics: {
          processingTime: Date.now() - startTime,
          toolCalls: executionResults?.results?.length || 0
        }
      });

      // Update context
      await this.contextManager.updateContext({
        conversationId,
        reasoning,
        executionResults
      });

      // Calculate metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(processingTime);

      const result = {
        success: true,
        conversationId,
        reasoning,
        executionResults,
        metrics: {
          processingTime,
          toolCalls: executionResults?.results?.length || 0,
          tokensUsed: reasoning.tokensUsed || 0
        }
      };

      this.logger.info('Input processing completed', result.metrics);
      this.emit('processing:complete', result);

      return result;

    } catch (error) {
      this.metrics.errors++;
      this.state = 'error';
      
      const errorResult = {
        success: false,
        conversationId,
        error: error.message,
        metrics: {
          processingTime: Date.now() - startTime
        }
      };

      this.logger.error('Input processing failed', { 
        error: error.message, 
        stack: error.stack,
        conversationId 
      });

      this.emit('processing:error', errorResult);
      return errorResult;
    }
  }

  /**
   * Execute planned actions using the tool registry
   */
  async executeActions(actions, options = {}) {
    try {
      this.logger.info('Executing actions', { 
        count: actions.length,
        conversationId: options.conversationId 
      });

      const results = [];
      const errors = [];

      for (const action of actions) {
        try {
          // Validate action
          const validation = await this.toolRegistry.validateAction(action);
          if (!validation.valid) {
            errors.push({
              action,
              error: `Validation failed: ${validation.errors.join(', ')}`
            });
            continue;
          }

          // Request confirmation if needed
          if (this.config.tools.confirmationRequired && !options.autoApprove) {
            const approved = await this.requestActionConfirmation(action);
            if (!approved) {
              results.push({
                action,
                status: 'skipped',
                reason: 'User declined'
              });
              continue;
            }
          }

          // Execute action
          const result = await this.toolRegistry.executeAction(action);
          results.push({
            action,
            status: result.success ? 'completed' : 'failed',
            result,
            duration: result.duration
          });

        } catch (error) {
          errors.push({
            action,
            error: error.message
          });
        }
      }

      return {
        success: errors.length === 0,
        results,
        errors,
        summary: {
          total: actions.length,
          completed: results.filter(r => r.status === 'completed').length,
          failed: results.filter(r => r.status === 'failed').length,
          skipped: results.filter(r => r.status === 'skipped').length,
          errors: errors.length
        }
      };

    } catch (error) {
      this.logger.error('Action execution failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Request user confirmation for action execution
   */
  async requestActionConfirmation(action) {
    return new Promise((resolve) => {
      this.emit('confirmation:required', {
        action,
        callback: resolve
      });
    });
  }

  /**
   * Update agent metrics
   */
  updateMetrics(processingTime) {
    const totalProcessingTime = this.metrics.averageResponseTime * this.metrics.conversations + processingTime;
    this.metrics.averageResponseTime = totalProcessingTime / (this.metrics.conversations + 1);
  }

  /**
   * Get current agent status
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      uptime: Date.now() - this.startTime.getTime(),
      metrics: { ...this.metrics },
      config: this.config,
      components: {
        toolRegistry: this.toolRegistry.getStatus(),
        conversationManager: this.conversationManager.getStatus(),
        reasoningEngine: this.reasoningEngine.getStatus(),
        contextManager: this.contextManager.getStatus()
      }
    };
  }

  /**
   * Update agent configuration
   */
  async updateConfig(newConfig) {
    const schema = Joi.object({
      temperature: Joi.number().min(0).max(2),
      maxTokens: Joi.number().min(1).max(100000),
      reasoning: Joi.object(),
      tools: Joi.object(),
      context: Joi.object(),
      security: Joi.object(),
      logging: Joi.object()
    });

    const { error, value } = schema.validate(newConfig);
    if (error) {
      throw new Error(`Invalid configuration update: ${error.details[0].message}`);
    }

    // Update configuration
    Object.assign(this.config, value);

    // Update components
    if (value.reasoning) {
      await this.reasoningEngine.updateConfig(value.reasoning);
    }
    if (value.tools) {
      await this.toolRegistry.updateConfig(value.tools);
    }
    if (value.context) {
      await this.contextManager.updateConfig(value.context);
    }

    this.logger.info('Configuration updated', { newConfig: value });
    this.emit('config:updated', value);
  }

  /**
   * Gracefully shutdown the agent
   */
  async shutdown() {
    this.logger.info('Shutting down agent', { id: this.id });
    
    this.state = 'shutting_down';
    
    // Close all conversations
    await this.conversationManager.closeAll();
    
    // Stop all tool executions
    await this.toolRegistry.stopAll();
    
    // Cleanup context
    await this.contextManager.cleanup();
    
    this.state = 'shutdown';
    this.emit('shutdown');
    
    this.logger.info('Agent shutdown complete');
  }
}

module.exports = Agent;