const ToolRegistry = require('./tools');
const Logger = require('./logger');
const Utils = require('./utils');
const readline = require('readline');

/**
 * Core agent reasoning engine that processes LLM responses and executes actions
 */
class Agent {
  constructor(options = {}) {
    this.logger = new Logger(options.logger);
    this.toolRegistry = new ToolRegistry(this.logger);
    this.confirmationEnabled = options.confirmationEnabled !== false;
    this.autoApprove = options.autoApprove === true;
    this.maxActionsPerPrompt = options.maxActionsPerPrompt || 10;
    this.currentConversationId = null;
    
    // Action detection patterns
    this.actionPatterns = this.initializeActionPatterns();
  }

  /**
   * Initialize action detection patterns
   */
  initializeActionPatterns() {
    return [
      // Universal creation patterns
      {
        pattern: /(?:create|make|build|generate|add|setup)\s+(?:a\s+)?(.+)/i,
        action: 'createContent',
        tool: 'filesystem',
        method: 'createContent',
        confidence: 0.8,
        universal: true
      },
      {
        pattern: /(?:write|code|develop)\s+(.+)/i,
        action: 'createContent',
        tool: 'filesystem',
        method: 'createContent',
        confidence: 0.75,
        universal: true
      },
      {
        pattern: /(?:modify|update|change|edit)\s+(.+)/i,
        action: 'modifyContent',
        tool: 'filesystem',
        method: 'modifyContent',
        confidence: 0.8,
        universal: true
      },
      {
        pattern: /(?:delete|remove)\s+(.+)/i,
        action: 'deleteContent',
        tool: 'filesystem',
        method: 'remove',
        confidence: 0.9,
        universal: true
      },
      {
        pattern: /(?:install|add)\s+(?:package|dependency|module)\s+(.+)/i,
        action: 'installPackage',
        tool: 'exec',
        method: 'installPackage',
        confidence: 0.9
      },
      {
        pattern: /(?:run|execute)\s+(.+)/i,
        action: 'runCommand',
        tool: 'exec',
        method: 'executeCommand',
        confidence: 0.8
      },
      {
        pattern: /(?:list|show|display)\s+(?:files|contents|directory)/i,
        action: 'listDirectory',
        tool: 'filesystem',
        method: 'listDir',
        confidence: 0.8
      },
      {
        pattern: /(?:copy|duplicate)\s+(.+)\s+(?:to|as)\s+(.+)/i,
        action: 'copyContent',
        tool: 'filesystem',
        method: 'copy',
        confidence: 0.85
      },
      {
        pattern: /(?:move|rename)\s+(.+)\s+(?:to|as)\s+(.+)/i,
        action: 'moveContent',
        tool: 'filesystem',
        method: 'move',
        confidence: 0.85
      },
      {
        pattern: /(?:read|open|view)\s+(.+)/i,
        action: 'readContent',
        tool: 'filesystem',
        method: 'readFile',
        confidence: 0.7
      }
    ];
  }

  /**
   * Process user prompt and LLM response to determine actions
   */
  async processPrompt(prompt, llmResponse, metadata = {}) {
    try {
      // Start conversation logging
      this.currentConversationId = await this.logger.logPrompt(prompt, metadata);
      await this.logger.logResponse(this.currentConversationId, llmResponse, metadata);

      // Analyze the response for actionable items
      const actions = this.detectActions(prompt, llmResponse);
      
      if (actions.length === 0) {
        // No actions detected, just return the response
        return {
          success: true,
          response: llmResponse,
          actions: [],
          executed: false
        };
      }

      // Log reasoning
      await this.logger.logReasoning(this.currentConversationId, 
        `Detected ${actions.length} potential actions`, actions);

      // Filter and validate actions
      const validActions = await this.validateActions(actions);
      
      if (validActions.length === 0) {
        return {
          success: true,
          response: llmResponse,
          actions: [],
          executed: false,
          reason: 'No valid actions found'
        };
      }

      // Request user confirmation if needed
      const approvedActions = await this.requestConfirmation(validActions);
      
      if (approvedActions.length === 0) {
        return {
          success: true,
          response: llmResponse,
          actions: validActions,
          executed: false,
          reason: 'User declined to execute actions'
        };
      }

      // Execute approved actions
      const executionResults = await this.executeActions(approvedActions);

      return {
        success: true,
        response: llmResponse,
        actions: validActions,
        executed: true,
        results: executionResults
      };

    } catch (error) {
      await this.logger.logError(error, { prompt, conversationId: this.currentConversationId });
      
      return {
        success: false,
        error: error.message,
        response: llmResponse,
        actions: [],
        executed: false
      };
    }
  }

  /**
   * Detect actionable items from prompt and response
   */
  detectActions(prompt, response) {
    const actions = [];
    const combinedText = `${prompt} ${response}`;

    // Check each pattern
    for (const pattern of this.actionPatterns) {
      const matches = combinedText.match(pattern.pattern);
      
      if (matches) {
        // Extract parameters from the match
        const params = this.extractActionParameters(pattern, matches, combinedText);
        
        actions.push({
          id: Utils.generateId(),
          type: pattern.action,
          tool: pattern.tool,
          method: pattern.method,
          params,
          confidence: pattern.confidence,
          source: matches[0],
          destructive: this.isDestructiveAction(pattern.action)
        });
      }
    }

    // Sort by confidence
    return actions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract parameters for specific actions
   */
  extractActionParameters(pattern, matches, text) {
    const params = [];
    
    switch (pattern.action) {
      case 'createContent':
      case 'modifyContent': {
        // Extract what to create/modify from the captured group
        let content = matches[1];
        
        // For createContent, try to extract just the filename/path
        if (pattern.action === 'createContent') {
          // Look for file patterns in the content
          const fileMatch = content.match(/(?:file|directory|folder)?\s*(?:called|named)?\s*([^\s,.]+(?:\.[a-zA-Z0-9]+)?)/i);
          if (fileMatch) {
            content = fileMatch[1];
          } else {
            // Look for quoted filenames
            const quotedMatch = content.match(/["']([^"']+)["']/);
            if (quotedMatch) {
              content = quotedMatch[1];
            } else {
              // Extract first word that looks like a filename
              const words = content.trim().split(/\s+/);
              for (const word of words) {
                if (word.includes('.') || word.match(/^[a-zA-Z0-9_-]+$/)) {
                  content = word;
                  break;
                }
              }
            }
          }
        }
        
        params.push(content);
        // Try to extract additional context from the full text
        const codeBlockMatch = text.match(/```[\w]*\n([\s\S]*?)\n```/);
        if (codeBlockMatch) {
          params.push(codeBlockMatch[1]);
        }
        break;
      }
        
      case 'deleteContent':
      case 'readContent':
        params.push(matches[1]); // what to delete/read
        break;
        
      case 'copyContent':
      case 'moveContent': {
        // Extract source and destination
        const fullMatch = matches[0];
        const parts = fullMatch.match(/(.+)\s+(?:to|as)\s+(.+)/i);
        if (parts) {
          params.push(parts[1].trim()); // source
          params.push(parts[2].trim()); // destination
        }
        break;
      }
        
      case 'installPackage':
        params.push(matches[1]); // package name
        break;
        
      case 'runCommand':
        params.push(matches[1]); // command
        break;
        
      case 'listDirectory':
        params.push('.'); // current directory by default
        break;
        
      default:
        if (matches[1]) {
          params.push(matches[1]);
        }
    }

    return params;
  }

  /**
   * Check if action is destructive
   */
  isDestructiveAction(action) {
    const destructiveActions = [
      'deleteFile',
      'writeFile', // Can overwrite existing files
      'runCommand' // Can be destructive
    ];
    
    return destructiveActions.includes(action);
  }

  /**
   * Validate actions before execution
   */
  async validateActions(actions) {
    const validActions = [];

    for (const action of actions) {
      try {
        // Validate with tool registry
        const validation = this.toolRegistry.validateOperation(
          action.tool, 
          action.method, 
          action.params
        );

        if (validation.valid) {
          validActions.push({
            ...action,
            warnings: validation.warnings
          });
        } else {
          await this.logger.logAction('agent', 'actionValidationFailed', {
            action: action.type,
            errors: validation.errors
          });
        }
      } catch (error) {
        await this.logger.logAction('agent', 'actionValidationError', {
          action: action.type,
          error: error.message
        });
      }
    }

    return validActions;
  }

  /**
   * Request user confirmation for actions
   */
  async requestConfirmation(actions) {
    if (!this.confirmationEnabled || this.autoApprove) {
      return actions;
    }

    const approvedActions = [];

    // Group actions by destructiveness
    const destructiveActions = actions.filter(a => a.destructive);
    const safeActions = actions.filter(a => !a.destructive);

    // Auto-approve safe actions
    approvedActions.push(...safeActions);

    // Request confirmation for destructive actions
    if (destructiveActions.length > 0) {
      console.log(Utils.formatActionSummary(destructiveActions));
      
      const confirmed = await this.askConfirmation(`Execute ${destructiveActions.length} potentially destructive action(s)?`);

      if (confirmed) {
        approvedActions.push(...destructiveActions);
      }
    }

    return approvedActions;
  }

  /**
   * Ask user for confirmation using readline
   */
  async askConfirmation(question) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(`${question} (y/N): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  /**
   * Execute approved actions
   */
  async executeActions(actions) {
    const results = [];
    let executedCount = 0;

    for (const action of actions) {
      if (executedCount >= this.maxActionsPerPrompt) {
        Utils.logWarning(`Maximum actions per prompt (${this.maxActionsPerPrompt}) reached`);
        break;
      }

      try {
        Utils.logInfo(`Executing: ${action.type} - ${action.source}`);
        
        const spinner = Utils.createSpinner(`Executing ${action.type}...`);
        spinner.start();

        const result = await this.toolRegistry.executeTool(
          action.tool,
          action.method,
          action.params
        );

        spinner.stop();

        if (result.success) {
          Utils.logSuccess(`Completed: ${action.type}`);
        } else {
          Utils.logError(`Failed: ${action.type} - ${result.error}`);
        }

        results.push({
          action,
          result,
          success: result.success
        });

        executedCount++;

      } catch (error) {
        Utils.logError(`Error executing ${action.type}: ${error.message}`);
        
        results.push({
          action,
          result: { success: false, error: error.message },
          success: false
        });
      }
    }

    return results;
  }

  /**
   * Configure agent settings
   */
  configure(settings = {}) {
    if (settings.confirmationEnabled !== undefined) {
      this.confirmationEnabled = settings.confirmationEnabled;
    }
    
    if (settings.autoApprove !== undefined) {
      this.autoApprove = settings.autoApprove;
    }
    
    if (settings.maxActionsPerPrompt !== undefined) {
      this.maxActionsPerPrompt = settings.maxActionsPerPrompt;
    }

    // Configure tool security
    if (settings.toolSecurity) {
      this.toolRegistry.configureTool('exec', settings.toolSecurity);
    }
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      ready: this.toolRegistry.getStatus().ready,
      tools: this.toolRegistry.getAvailableTools(),
      settings: {
        confirmationEnabled: this.confirmationEnabled,
        autoApprove: this.autoApprove,
        maxActionsPerPrompt: this.maxActionsPerPrompt
      },
      currentSession: this.logger.getSessionId()
    };
  }

  /**
   * Get conversation history
   */
  async getHistory(limit = 10) {
    return await this.logger.getHistory(limit);
  }

  /**
   * End current session
   */
  async endSession() {
    await this.logger.endSession();
  }

  /**
   * Add custom action pattern
   */
  addActionPattern(pattern) {
    this.actionPatterns.push(pattern);
  }

  /**
   * Get available tools description
   */
  getToolsDescription() {
    return this.toolRegistry.getToolDescriptions();
  }
}

// Extend Utils with agent-specific formatting
Utils.formatActionSummary = function(actions) {
  const header = Utils.chalk.cyan('\n🤖 Agent wants to execute the following actions:\n');
  const separator = Utils.chalk.gray('─'.repeat(50));
  
  let summary = header + separator + '\n';
  
  actions.forEach((action, index) => {
    const icon = action.destructive ? '⚠️ ' : '✅ ';
    const actionDesc = `${icon} ${action.type}: ${action.source}`;
    summary += Utils.chalk.white(`${index + 1}. ${actionDesc}\n`);
    
    if (action.warnings && action.warnings.length > 0) {
      action.warnings.forEach(warning => {
        summary += Utils.chalk.yellow(`   ⚠ ${warning}\n`);
      });
    }
  });
  
  summary += Utils.chalk.gray(separator) + '\n';
  return summary;
};

Utils.generateId = function() {
  return Math.random().toString(36).substr(2, 9);
};

module.exports = Agent;