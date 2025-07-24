const Agent = require('./core/Agent');
const Providers = require('./providers');

/**
 * Enhanced Agent implementation with Forge-style sophisticated reasoning
 * This replaces the old agent.js with advanced capabilities
 */
class EnhancedAgent extends Agent {
  constructor(options = {}) {
    // Initialize with enhanced defaults
    const enhancedOptions = {
      name: 'visaire-enhanced-agent',
      model: options.model || 'claude-3-sonnet-20240229',
      provider: options.provider || 'claude',
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 4000,
      reasoning: {
        effort: options.effort || 'medium',
        maxIterations: options.maxIterations || 10,
        enableReflection: options.enableReflection !== false,
        enablePlanning: options.enablePlanning !== false
      },
      tools: {
        enabled: options.toolsEnabled !== false,
        autoApprove: options.autoApprove || false,
        confirmationRequired: options.confirmationRequired !== false,
        maxConcurrent: options.maxConcurrent || 3
      },
      context: {
        maxSize: options.maxContextSize || 100000,
        compressionThreshold: options.compressionThreshold || 0.8,
        retentionStrategy: options.retentionStrategy || 'importance'
      },
      security: options.security || {
        allowedPaths: ['./'],
        blockedCommands: ['rm -rf', 'sudo', 'format'],
        maxFileSize: 10485760, // 10MB
        sandboxMode: false
      },
      logging: {
        level: options.logLevel || 'info',
        enableMetrics: options.enableMetrics !== false,
        enableTracing: options.enableTracing || false
      },
      ...options
    };

    super(enhancedOptions);

    // Store provider configuration
    this.providerConfig = {
      provider: enhancedOptions.provider,
      apiKey: options.apiKey,
      model: enhancedOptions.model,
      temperature: enhancedOptions.temperature,
      maxTokens: enhancedOptions.maxTokens
    };

    // Initialize providers
    this.providers = new Providers({
      timeout: options.timeout || 30000,
      maxRetries: options.maxRetries || 3
    });
  }

  /**
   * Process user prompt with enhanced reasoning
   */
  async processPrompt(prompt, options = {}) {
    try {
      // Validate inputs
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        throw new Error('Prompt is required and must be a non-empty string');
      }

      // Merge options with defaults
      const processOptions = {
        provider: options.provider || this.providerConfig.provider,
        apiKey: options.apiKey || this.providerConfig.apiKey,
        model: options.model || this.providerConfig.model,
        temperature: options.temperature || this.providerConfig.temperature,
        maxTokens: options.maxTokens || this.providerConfig.maxTokens,
        autoApprove: options.autoApprove || this.config.tools.autoApprove,
        effort: options.effort || this.config.reasoning.effort,
        ...options
      };

      this.logger.info('Processing prompt with enhanced agent', {
        promptLength: prompt.length,
        provider: processOptions.provider,
        model: processOptions.model,
        effort: processOptions.effort
      });

      // Step 1: Get LLM response with context
      const llmResponse = await this.getLLMResponse(prompt, processOptions);

      // Step 2: Process with enhanced reasoning
      const result = await this.processInput(prompt, {
        llmResponse,
        ...processOptions
      });

      // Step 3: Format final response
      const formattedResult = this.formatResult(result, llmResponse);

      this.logger.info('Prompt processing completed', {
        success: formattedResult.success,
        actionsExecuted: formattedResult.executionResults?.summary?.completed || 0,
        processingTime: formattedResult.metrics?.processingTime
      });

      return formattedResult;

    } catch (error) {
      this.logger.error('Prompt processing failed', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        prompt,
        response: null,
        executionResults: null,
        metrics: {
          processingTime: 0,
          toolCalls: 0,
          tokensUsed: 0
        }
      };
    }
  }

  /**
   * Get LLM response with enhanced prompting
   */
  async getLLMResponse(prompt, options) {
    try {
      // Build context-aware prompt
      const enhancedPrompt = await this.buildEnhancedPrompt(prompt, options);

      // Make LLM call
      const response = await this.providers.call(
        options.provider,
        options.apiKey,
        enhancedPrompt,
        {
          model: options.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens
        }
      );

      this.logger.debug('LLM response received', {
        provider: options.provider,
        model: options.model,
        responseLength: response.length
      });

      return response;

    } catch (error) {
      this.logger.error('LLM response failed', {
        provider: options.provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Build enhanced prompt with context and reasoning instructions
   */
  async buildEnhancedPrompt(userPrompt, options) {
    // Get current context
    const context = await this.contextManager.buildContext({
      input: userPrompt,
      options
    });

    // Build system prompt based on effort level
    const systemPrompt = this.buildSystemPrompt(options.effort, context);

    // Combine system prompt with user prompt
    const enhancedPrompt = `${systemPrompt}

User Request: ${userPrompt}

Please analyze this request carefully and provide a comprehensive response. If the request requires actions to be taken (like creating files, running commands, or making changes), please clearly indicate what actions should be performed.`;

    this.logger.debug('Enhanced prompt built', {
      systemPromptLength: systemPrompt.length,
      totalPromptLength: enhancedPrompt.length,
      contextSections: Object.keys(context.sections).length
    });

    return enhancedPrompt;
  }

  /**
   * Build system prompt based on effort level and context
   */
  buildSystemPrompt(effort, context) {
    const basePrompt = `You are Visaire, an advanced AI agent with sophisticated reasoning capabilities. You can analyze requests, plan actions, and execute tasks autonomously.

Current Context:
- Working Directory: ${context.workingDirectory}
- Available Files: ${context.sections.fileSystem?.files?.length || 0} files
- Project Type: ${context.sections.fileSystem?.projectStructure?.patterns?.join(', ') || 'Unknown'}
- Dependencies: ${context.sections.dependencies?.installedPackages?.length || 0} packages installed

Capabilities:
- File Operations: Create, read, modify, delete files and directories
- Command Execution: Run shell commands and install packages
- Code Analysis: Analyze code structure and dependencies
- Network Operations: Make HTTP requests and download files

`;

    // Add effort-specific instructions
    switch (effort) {
      case 'low':
        return basePrompt + `Instructions:
- Provide direct, simple responses
- Execute only the most essential actions
- Minimize complexity and processing time`;

      case 'medium':
        return basePrompt + `Instructions:
- Analyze the request thoroughly
- Plan actions before executing
- Provide detailed explanations
- Consider potential issues and alternatives`;

      case 'high':
        return basePrompt + `Instructions:
- Perform deep analysis of the request
- Create comprehensive execution plans
- Consider multiple approaches and trade-offs
- Reflect on results and suggest improvements
- Anticipate edge cases and error scenarios`;

      case 'maximum':
        return basePrompt + `Instructions:
- Conduct exhaustive analysis of all aspects
- Generate multiple alternative approaches
- Perform detailed risk assessment
- Create step-by-step execution plans with contingencies
- Continuously reflect and optimize throughout the process
- Provide comprehensive documentation and explanations`;

      default:
        return basePrompt + `Instructions:
- Analyze the request and plan appropriate actions
- Execute tasks efficiently and safely
- Provide clear explanations of what was done`;
    }
  }

  /**
   * Format final result for user
   */
  formatResult(processingResult, llmResponse) {
    const result = {
      success: processingResult.success,
      response: llmResponse,
      reasoning: processingResult.reasoning,
      executionResults: processingResult.executionResults,
      metrics: processingResult.metrics,
      conversationId: processingResult.conversationId
    };

    // Add summary information
    if (processingResult.executionResults) {
      result.summary = {
        actionsPlanned: processingResult.reasoning?.actions?.length || 0,
        actionsExecuted: processingResult.executionResults.summary?.completed || 0,
        filesCreated: this.countFileActions(processingResult.executionResults, 'create'),
        filesModified: this.countFileActions(processingResult.executionResults, 'modify'),
        commandsRun: this.countToolActions(processingResult.executionResults, 'exec'),
        errors: processingResult.executionResults.summary?.failed || 0
      };
    }

    return result;
  }

  /**
   * Count file actions in execution results
   */
  countFileActions(executionResults, actionType) {
    if (!executionResults.results) return 0;
    
    return executionResults.results.filter(result => 
      result.action?.tool === 'filesystem' && 
      result.action?.type?.includes(actionType)
    ).length;
  }

  /**
   * Count tool actions in execution results
   */
  countToolActions(executionResults, toolName) {
    if (!executionResults.results) return 0;
    
    return executionResults.results.filter(result => 
      result.action?.tool === toolName
    ).length;
  }

  /**
   * Start autonomous session (enhanced version)
   */
  async startAutonomousSession(prompt, options = {}) {
    let iteration = 0; // Declare iteration at function scope
    try {
      this.logger.info('Starting autonomous session', {
        promptLength: prompt.length,
        maxIterations: options.maxIterations || 10
      });

      const sessionOptions = {
        maxIterations: options.maxIterations || 10,
        autoApprove: true, // Autonomous mode auto-approves actions
        effort: options.effort || 'high', // Use high effort for autonomous mode
        ...options
      };

      let currentPrompt = prompt;
      const maxIterations = sessionOptions.maxIterations;
      const results = [];

      while (iteration < maxIterations) {
        iteration++;
        
        this.logger.info(`Autonomous iteration ${iteration}/${maxIterations}`);

        // Process current prompt
        const result = await this.processPrompt(currentPrompt, sessionOptions);
        results.push(result);

        // Check if task is complete
        if (this.isTaskComplete(result)) {
          this.logger.info('Autonomous session completed successfully', {
            iterations: iteration,
            totalActions: results.reduce((sum, r) => sum + (r.summary?.actionsExecuted || 0), 0)
          });
          break;
        }

        // Generate continuation prompt
        currentPrompt = this.generateContinuationPrompt(prompt, result, iteration);
      }

      return {
        success: true,
        iterations: iteration,
        results,
        summary: this.summarizeAutonomousSession(results)
      };

    } catch (error) {
      this.logger.error('Autonomous session failed', {
        error: error.message,
        iteration: iteration
      });
      throw error;
    }
  }

  /**
   * Check if autonomous task is complete
   */
  isTaskComplete(result) {
    if (!result.success) return false;
    
    // Check if no more actions are planned
    if (!result.reasoning?.actions || result.reasoning.actions.length === 0) {
      return true;
    }

    // Check for completion indicators in response
    const response = result.response?.toLowerCase() || '';
    const completionIndicators = [
      'task completed', 'task is complete', 'finished', 'done',
      'successfully completed', 'all steps completed'
    ];

    return completionIndicators.some(indicator => response.includes(indicator));
  }

  /**
   * Generate continuation prompt for autonomous session
   */
  generateContinuationPrompt(originalPrompt, lastResult, iteration) {
    const executedActions = lastResult.summary?.actionsExecuted || 0;
    const errors = lastResult.summary?.errors || 0;

    let continuationPrompt = `Continue with the original task: "${originalPrompt}"

Progress Update (Iteration ${iteration}):
- Actions executed: ${executedActions}
- Errors encountered: ${errors}`;

    if (lastResult.summary?.filesCreated > 0) {
      continuationPrompt += `\n- Files created: ${lastResult.summary.filesCreated}`;
    }

    if (lastResult.summary?.commandsRun > 0) {
      continuationPrompt += `\n- Commands executed: ${lastResult.summary.commandsRun}`;
    }

    continuationPrompt += `\n\nWhat is the next step to complete this task? If the task is already complete, please confirm completion.`;

    return continuationPrompt;
  }

  /**
   * Summarize autonomous session results
   */
  summarizeAutonomousSession(results) {
    const summary = {
      totalIterations: results.length,
      totalActions: 0,
      totalFiles: 0,
      totalCommands: 0,
      totalErrors: 0,
      processingTime: 0,
      success: results.every(r => r.success)
    };

    for (const result of results) {
      if (result.summary) {
        summary.totalActions += result.summary.actionsExecuted || 0;
        summary.totalFiles += (result.summary.filesCreated || 0) + (result.summary.filesModified || 0);
        summary.totalCommands += result.summary.commandsRun || 0;
        summary.totalErrors += result.summary.errors || 0;
      }
      if (result.metrics) {
        summary.processingTime += result.metrics.processingTime || 0;
      }
    }

    return summary;
  }

  /**
   * Get enhanced agent status
   */
  getEnhancedStatus() {
    const baseStatus = this.getStatus();
    
    return {
      ...baseStatus,
      version: '2.0.0',
      type: 'enhanced',
      capabilities: [
        'sophisticated_reasoning',
        'context_awareness', 
        'autonomous_execution',
        'code_intelligence',
        'multi_step_planning',
        'reflection_and_adjustment'
      ],
      providerConfig: {
        provider: this.providerConfig.provider,
        model: this.providerConfig.model,
        hasApiKey: !!this.providerConfig.apiKey
      }
    };
  }
}

module.exports = EnhancedAgent;