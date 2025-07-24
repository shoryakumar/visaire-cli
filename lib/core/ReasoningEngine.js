const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const Handlebars = require('handlebars');

/**
 * Advanced reasoning engine implementing Forge-style multi-step reasoning
 * Handles planning, reflection, and iterative problem solving
 */
class ReasoningEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.logger = options.logger;
    this.effort = options.effort || 'medium';
    this.maxIterations = options.maxIterations || 10;
    this.enableReflection = options.enableReflection !== false;
    this.enablePlanning = options.enablePlanning !== false;
    
    // Reasoning templates
    this.templates = this.initializeTemplates();
    
    // Effort level configurations
    this.effortConfigs = {
      low: {
        maxIterations: 3,
        planningDepth: 1,
        reflectionEnabled: false,
        temperature: 0.3,
        thinkingTime: 1000
      },
      medium: {
        maxIterations: 7,
        planningDepth: 2,
        reflectionEnabled: true,
        temperature: 0.5,
        thinkingTime: 3000
      },
      high: {
        maxIterations: 12,
        planningDepth: 3,
        reflectionEnabled: true,
        temperature: 0.7,
        thinkingTime: 5000
      },
      maximum: {
        maxIterations: 20,
        planningDepth: 4,
        reflectionEnabled: true,
        temperature: 0.8,
        thinkingTime: 10000
      }
    };
    
    this.currentConfig = this.effortConfigs[this.effort];
  }

  /**
   * Initialize reasoning templates
   */
  initializeTemplates() {
    return {
      planning: Handlebars.compile(`
<thinking>
I need to analyze this request and create a comprehensive plan.

User Request: {{input}}

Context:
{{#if context.files}}
Available Files: {{#each context.files}}{{this.name}} {{/each}}
{{/if}}
{{#if context.workingDirectory}}
Working Directory: {{context.workingDirectory}}
{{/if}}
{{#if context.conversation}}
Previous Messages: {{context.conversation.messages.length}}
{{/if}}

Let me break this down into steps:

1. Understanding: What exactly is the user asking for?
2. Analysis: What information and tools do I need?
3. Planning: What's the best approach to solve this?
4. Execution: What specific actions should I take?

{{#if enableReflection}}
5. Reflection: How can I verify this will work?
{{/if}}
</thinking>

Based on your request, I need to create a comprehensive plan to {{input}}.

Let me think through this step by step:

**Understanding the Request:**
{{input}}

**Analysis:**
- Current context: {{context.workingDirectory}}
- Available tools: {{#each availableTools}}{{this.name}} {{/each}}
- Complexity level: {{complexityLevel}}

**Planned Approach:**
{{#each planSteps}}
{{@index}}. {{this.description}}
   - Tool: {{this.tool}}
   - Expected outcome: {{this.outcome}}
{{/each}}

**Next Steps:**
I'll now execute this plan systematically, starting with {{firstStep}}.
      `),
      
      reflection: Handlebars.compile(`
<thinking>
Let me reflect on what I've done so far and whether it's working correctly.

Original Request: {{originalInput}}
Actions Taken: {{#each actionsTaken}}{{this.type}} {{/each}}
Current State: {{currentState}}

Questions to consider:
1. Am I on the right track to solve the user's problem?
2. Are there any errors or issues I need to address?
3. What should I do next?
4. Is there a better approach I should consider?

{{#if errors}}
Errors encountered: {{#each errors}}{{this.message}} {{/each}}
I need to address these issues.
{{/if}}

{{#if partialSuccess}}
Partial success achieved. I should continue with the plan.
{{/if}}
</thinking>

Let me reflect on the progress so far:

**What I've accomplished:**
{{#each completedActions}}
- {{this.description}} ({{this.status}})
{{/each}}

**Current assessment:**
{{assessmentSummary}}

**Next steps:**
{{#if shouldContinue}}
I should continue with: {{nextAction}}
{{else}}
{{#if shouldAdjust}}
I need to adjust my approach: {{adjustmentReason}}
{{else}}
The task appears to be complete.
{{/if}}
{{/if}}
      `),
      
      execution: Handlebars.compile(`
I'll now execute the planned action: {{action.type}}

**Action Details:**
- Tool: {{action.tool}}
- Method: {{action.method}}
- Parameters: {{#each action.parameters}}{{this}} {{/each}}
- Expected outcome: {{action.expectedOutcome}}

{{#if action.risks}}
**Potential risks:**
{{#each action.risks}}
- {{this}}
{{/each}}
{{/if}}

Executing now...
      `),
      
      completion: Handlebars.compile(`
**Task Summary:**

I have {{#if success}}successfully completed{{else}}attempted{{/if}} your request: "{{originalInput}}"

**Actions Performed:**
{{#each actions}}
{{@index}}. {{this.type}}: {{this.description}} - {{this.status}}
{{/each}}

**Results:**
{{#if success}}
✅ Task completed successfully
{{#each results}}
- {{this.description}}
{{/each}}
{{else}}
⚠️ Task completed with issues
{{#each issues}}
- {{this.description}}
{{/each}}
{{/if}}

**Files Created/Modified:**
{{#each filesChanged}}
- {{this.path}} ({{this.action}})
{{/each}}

{{#if nextSteps}}
**Suggested next steps:**
{{#each nextSteps}}
- {{this}}
{{/each}}
{{/if}}
      `)
    };
  }

  /**
   * Main reasoning process
   */
  async process(options = {}) {
    const startTime = Date.now();
    const reasoningId = uuidv4();
    
    try {
      this.emit('reasoning:start', { id: reasoningId, input: options.input });
      
      if (this.logger) {
        this.logger.info('Starting reasoning process', {
          id: reasoningId,
          effort: this.effort,
          input: options.input?.substring(0, 100) + '...'
        });
      }

      // Initialize reasoning state
      const state = {
        id: reasoningId,
        input: options.input,
        context: options.context || {},
        conversation: options.conversation || {},
        config: options.config || {},
        iteration: 0,
        maxIterations: this.currentConfig.maxIterations,
        plan: null,
        actions: [],
        reflections: [],
        errors: [],
        status: 'thinking'
      };

      // Step 1: Planning phase
      if (this.enablePlanning) {
        await this.planningPhase(state);
      }

      // Step 2: Execution phase
      await this.executionPhase(state);

      // Step 3: Reflection phase (if enabled and needed)
      if (this.enableReflection && this.shouldReflect(state)) {
        await this.reflectionPhase(state);
      }

      // Finalize reasoning
      const duration = Date.now() - startTime;
      const result = this.finalizeReasoning(state, duration);

      this.emit('reasoning:complete', result);
      
      if (this.logger) {
        this.logger.info('Reasoning process completed', {
          id: reasoningId,
          duration,
          iterations: state.iteration,
          actionsPlanned: result.actions.length
        });
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (this.logger) {
        this.logger.error('Reasoning process failed', {
          id: reasoningId,
          error: error.message,
          duration
        });
      }

      this.emit('reasoning:error', { id: reasoningId, error: error.message, duration });
      throw error;
    }
  }

  /**
   * Planning phase - analyze and create execution plan
   */
  async planningPhase(state) {
    if (this.logger) {
      this.logger.debug('Starting planning phase', { id: state.id });
    }

    // Analyze complexity
    const complexity = this.analyzeComplexity(state.input, state.context);
    
    // Generate plan based on input and context
    const plan = await this.generatePlan(state.input, state.context, complexity);
    
    state.plan = plan;
    state.complexity = complexity;

    if (this.logger) {
      this.logger.debug('Planning phase completed', {
        id: state.id,
        complexity: complexity.level,
        planSteps: plan.steps.length
      });
    }
  }

  /**
   * Execution phase - execute planned actions
   */
  async executionPhase(state) {
    if (this.logger) {
      this.logger.debug('Starting execution phase', { id: state.id });
    }

    const actions = state.plan ? state.plan.actions : await this.generateDirectActions(state.input, state.context);
    
    for (const action of actions) {
      if (state.iteration >= state.maxIterations) {
        if (this.logger) {
          this.logger.warn('Max iterations reached during execution', { id: state.id });
        }
        break;
      }

      // Validate action
      const validation = this.validateAction(action, state.context);
      if (!validation.valid) {
        state.errors.push({
          type: 'validation',
          action: action.type,
          errors: validation.errors
        });
        continue;
      }

      // Add action to execution list
      state.actions.push({
        ...action,
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        iteration: state.iteration,
        status: 'planned'
      });

      state.iteration++;
    }

    if (this.logger) {
      this.logger.debug('Execution phase completed', {
        id: state.id,
        actionsPlanned: state.actions.length,
        errors: state.errors.length
      });
    }
  }

  /**
   * Reflection phase - analyze and potentially adjust
   */
  async reflectionPhase(state) {
    if (this.logger) {
      this.logger.debug('Starting reflection phase', { id: state.id });
    }

    const reflection = await this.generateReflection(state);
    state.reflections.push(reflection);

    // Determine if adjustments are needed
    if (reflection.needsAdjustment) {
      const adjustments = await this.generateAdjustments(state, reflection);
      
      // Apply adjustments
      for (const adjustment of adjustments) {
        if (adjustment.type === 'add_action') {
          state.actions.push({
            ...adjustment.action,
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            iteration: state.iteration++,
            status: 'planned',
            source: 'reflection'
          });
        } else if (adjustment.type === 'modify_action') {
          const actionIndex = state.actions.findIndex(a => a.id === adjustment.actionId);
          if (actionIndex !== -1) {
            Object.assign(state.actions[actionIndex], adjustment.changes);
          }
        } else if (adjustment.type === 'remove_action') {
          state.actions = state.actions.filter(a => a.id !== adjustment.actionId);
        }
      }
    }

    if (this.logger) {
      this.logger.debug('Reflection phase completed', {
        id: state.id,
        needsAdjustment: reflection.needsAdjustment,
        adjustments: reflection.needsAdjustment ? (reflection.adjustments?.length || 0) : 0
      });
    }
  }

  /**
   * Analyze input complexity
   */
  analyzeComplexity(input, context) {
    let score = 0;
    const factors = [];

    // Length factor
    if (input.length > 500) {
      score += 2;
      factors.push('long_input');
    } else if (input.length > 200) {
      score += 1;
      factors.push('medium_input');
    }

    // Multi-step indicators
    const multiStepIndicators = [
      'then', 'after', 'next', 'also', 'and then', 'followed by',
      'create and', 'build and', 'setup and', 'install and'
    ];
    
    const multiStepCount = multiStepIndicators.filter(indicator => 
      input.toLowerCase().includes(indicator)
    ).length;
    
    if (multiStepCount > 2) {
      score += 3;
      factors.push('complex_multi_step');
    } else if (multiStepCount > 0) {
      score += 1;
      factors.push('multi_step');
    }

    // File operation complexity
    const fileOperations = ['create', 'modify', 'delete', 'move', 'copy'];
    const fileOpCount = fileOperations.filter(op => 
      input.toLowerCase().includes(op)
    ).length;
    
    if (fileOpCount > 3) {
      score += 2;
      factors.push('complex_file_ops');
    } else if (fileOpCount > 1) {
      score += 1;
      factors.push('multiple_file_ops');
    }

    // Context complexity
    if (context.files && context.files.length > 10) {
      score += 1;
      factors.push('many_files');
    }

    // Determine level
    let level;
    if (score >= 6) level = 'very_high';
    else if (score >= 4) level = 'high';
    else if (score >= 2) level = 'medium';
    else level = 'low';

    return { score, level, factors };
  }

  /**
   * Generate execution plan
   */
  async generatePlan(input, context, complexity) {
    // Simulate thinking time based on effort level
    await this.simulateThinking();

    const plan = {
      id: uuidv4(),
      input,
      complexity: complexity.level,
      strategy: this.selectStrategy(complexity),
      steps: [],
      actions: [],
      estimatedDuration: 0,
      risks: []
    };

    // Generate plan steps based on input analysis
    const steps = this.analyzePlanningSteps(input, context);
    plan.steps = steps;

    // Convert steps to actions
    for (const step of steps) {
      const actions = this.stepToActions(step, context);
      plan.actions.push(...actions);
    }

    // Estimate duration and identify risks
    plan.estimatedDuration = this.estimateDuration(plan.actions);
    plan.risks = this.identifyRisks(plan.actions, context);

    return plan;
  }

  /**
   * Analyze planning steps from input
   */
  analyzePlanningSteps(input, context) {
    const steps = [];
    
    // Common patterns and their corresponding steps
    const patterns = [
      {
        regex: /create.*(?:file|directory|folder)/i,
        step: { type: 'file_creation', tool: 'filesystem', priority: 1 }
      },
      {
        regex: /install.*(?:package|dependency|module)/i,
        step: { type: 'package_installation', tool: 'exec', priority: 2 }
      },
      {
        regex: /run.*(?:command|script)/i,
        step: { type: 'command_execution', tool: 'exec', priority: 3 }
      },
      {
        regex: /modify.*(?:file|code)/i,
        step: { type: 'file_modification', tool: 'filesystem', priority: 2 }
      },
      {
        regex: /setup.*(?:project|environment)/i,
        step: { type: 'environment_setup', tool: 'multiple', priority: 1 }
      }
    ];

    // Find matching patterns
    for (const pattern of patterns) {
      if (pattern.regex.test(input)) {
        steps.push({
          id: uuidv4(),
          description: input.match(pattern.regex)[0],
          ...pattern.step
        });
      }
    }

    // If no specific patterns found, create generic step
    if (steps.length === 0) {
      steps.push({
        id: uuidv4(),
        type: 'general_task',
        tool: 'multiple',
        priority: 1,
        description: 'Execute user request'
      });
    }

    return steps.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Convert planning step to executable actions
   */
  stepToActions(step, context) {
    const actions = [];

    switch (step.type) {
      case 'file_creation':
        actions.push({
          type: 'create_file',
          tool: 'filesystem',
          method: 'createFile',
          parameters: this.extractFileParameters(step.description),
          expectedOutcome: 'File created successfully',
          risks: ['overwrite_existing_file']
        });
        break;

      case 'package_installation':
        actions.push({
          type: 'install_package',
          tool: 'exec',
          method: 'installPackage',
          parameters: this.extractPackageParameters(step.description),
          expectedOutcome: 'Package installed successfully',
          risks: ['network_dependency', 'version_conflicts']
        });
        break;

      case 'command_execution':
        actions.push({
          type: 'execute_command',
          tool: 'exec',
          method: 'executeCommand',
          parameters: this.extractCommandParameters(step.description),
          expectedOutcome: 'Command executed successfully',
          risks: ['command_failure', 'permission_issues']
        });
        break;

      case 'file_modification':
        actions.push({
          type: 'modify_file',
          tool: 'filesystem',
          method: 'modifyFile',
          parameters: this.extractModificationParameters(step.description),
          expectedOutcome: 'File modified successfully',
          risks: ['syntax_errors', 'data_loss']
        });
        break;

      case 'environment_setup':
        // Multi-step environment setup
        actions.push(
          {
            type: 'create_directory',
            tool: 'filesystem',
            method: 'createDirectory',
            parameters: ['project'],
            expectedOutcome: 'Project directory created'
          },
          {
            type: 'initialize_project',
            tool: 'exec',
            method: 'executeCommand',
            parameters: ['npm init -y'],
            expectedOutcome: 'Project initialized'
          }
        );
        break;

      default:
        actions.push({
          type: 'generic_action',
          tool: 'multiple',
          method: 'auto_detect',
          parameters: [step.description],
          expectedOutcome: 'Task completed'
        });
    }

    return actions;
  }

  /**
   * Extract parameters for different action types
   */
  extractFileParameters(description) {
    // Extract filename from description
    const filenameMatch = description.match(/(?:file|directory|folder)?\s*(?:called|named)?\s*([^\s,.]+(?:\.[a-zA-Z0-9]+)?)/i);
    return filenameMatch ? [filenameMatch[1]] : ['new_file.txt'];
  }

  extractPackageParameters(description) {
    const packageMatch = description.match(/(?:package|dependency|module)\s+([^\s,.]+)/i);
    return packageMatch ? [packageMatch[1]] : ['express'];
  }

  extractCommandParameters(description) {
    const commandMatch = description.match(/(?:run|execute)\s+(.+)/i);
    return commandMatch ? [commandMatch[1]] : ['echo "Hello World"'];
  }

  extractModificationParameters(description) {
    const fileMatch = description.match(/modify\s+([^\s,.]+)/i);
    return fileMatch ? [fileMatch[1], 'modified content'] : ['file.txt', 'modified content'];
  }

  /**
   * Generate direct actions without planning
   */
  async generateDirectActions(input, context) {
    await this.simulateThinking();
    
    // Simple pattern matching for direct actions
    const actions = [];
    
    if (input.toLowerCase().includes('create')) {
      actions.push({
        type: 'create_content',
        tool: 'filesystem',
        method: 'createFile',
        parameters: this.extractFileParameters(input)
      });
    }
    
    if (input.toLowerCase().includes('install')) {
      actions.push({
        type: 'install_package',
        tool: 'exec',
        method: 'installPackage',
        parameters: this.extractPackageParameters(input)
      });
    }

    return actions;
  }

  /**
   * Validate action before execution
   */
  validateAction(action, context) {
    const validation = { valid: true, errors: [], warnings: [] };

    // Check required fields
    if (!action.type) {
      validation.valid = false;
      validation.errors.push('Action type is required');
    }

    if (!action.tool) {
      validation.valid = false;
      validation.errors.push('Tool is required');
    }

    // Tool-specific validation
    if (action.tool === 'filesystem') {
      if (action.parameters && action.parameters[0]) {
        const filePath = action.parameters[0];
        if (filePath.includes('..')) {
          validation.warnings.push('Path contains ".." - potential security risk');
        }
      }
    }

    if (action.tool === 'exec') {
      if (action.parameters && action.parameters[0]) {
        const command = action.parameters[0];
        const dangerousCommands = ['rm -rf', 'sudo', 'format', 'del'];
        if (dangerousCommands.some(cmd => command.includes(cmd))) {
          validation.valid = false;
          validation.errors.push('Dangerous command detected');
        }
      }
    }

    return validation;
  }

  /**
   * Generate reflection on current state
   */
  async generateReflection(state) {
    await this.simulateThinking();

    const reflection = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      assessment: 'positive',
      needsAdjustment: false,
      confidence: 0.8,
      observations: [],
      recommendations: []
    };

    // Analyze errors
    if (state.errors.length > 0) {
      reflection.assessment = 'needs_attention';
      reflection.needsAdjustment = true;
      reflection.confidence = 0.4;
      reflection.observations.push(`${state.errors.length} errors detected`);
      reflection.recommendations.push('Address validation errors before proceeding');
    }

    // Analyze action complexity
    if (state.actions.length > 10) {
      reflection.observations.push('High number of actions planned');
      reflection.recommendations.push('Consider breaking into smaller tasks');
    }

    // Check for missing dependencies
    const hasFileOps = state.actions.some(a => a.tool === 'filesystem');
    const hasPackageInstalls = state.actions.some(a => a.type === 'install_package');
    
    if (hasFileOps && !hasPackageInstalls) {
      reflection.observations.push('File operations without package setup');
      reflection.recommendations.push('Consider if dependencies need to be installed first');
    }

    return reflection;
  }

  /**
   * Generate adjustments based on reflection
   */
  async generateAdjustments(state, reflection) {
    const adjustments = [];

    if (reflection.needsAdjustment) {
      // Add error handling actions
      if (state.errors.length > 0) {
        adjustments.push({
          type: 'add_action',
          action: {
            type: 'validate_environment',
            tool: 'filesystem',
            method: 'checkPath',
            parameters: ['.'],
            expectedOutcome: 'Environment validated'
          }
        });
      }

      // Reorder actions if needed
      const packageActions = state.actions.filter(a => a.type === 'install_package');
      const fileActions = state.actions.filter(a => a.tool === 'filesystem');
      
      if (packageActions.length > 0 && fileActions.length > 0) {
        // Ensure package installations come first
        for (let i = 0; i < fileActions.length; i++) {
          const fileAction = fileActions[i];
          const fileActionIndex = state.actions.findIndex(a => a.id === fileAction.id);
          const firstPackageIndex = state.actions.findIndex(a => a.type === 'install_package');
          
          if (fileActionIndex < firstPackageIndex) {
            adjustments.push({
              type: 'modify_action',
              actionId: fileAction.id,
              changes: { priority: 10 } // Lower priority (higher number)
            });
          }
        }
      }
    }

    return adjustments;
  }

  /**
   * Determine if reflection is needed
   */
  shouldReflect(state) {
    return (
      state.errors.length > 0 ||
      state.actions.length > 5 ||
      state.complexity?.level === 'high' ||
      state.complexity?.level === 'very_high'
    );
  }

  /**
   * Select strategy based on complexity
   */
  selectStrategy(complexity) {
    switch (complexity.level) {
      case 'low':
        return 'direct_execution';
      case 'medium':
        return 'planned_execution';
      case 'high':
        return 'iterative_execution';
      case 'very_high':
        return 'cautious_execution';
      default:
        return 'planned_execution';
    }
  }

  /**
   * Estimate duration for actions
   */
  estimateDuration(actions) {
    const baseTimes = {
      create_file: 2000,
      install_package: 30000,
      execute_command: 5000,
      modify_file: 3000,
      default: 2000
    };

    return actions.reduce((total, action) => {
      return total + (baseTimes[action.type] || baseTimes.default);
    }, 0);
  }

  /**
   * Identify risks in planned actions
   */
  identifyRisks(actions, context) {
    const risks = [];

    // File operation risks
    const fileActions = actions.filter(a => a.tool === 'filesystem');
    if (fileActions.length > 0) {
      risks.push('potential_file_conflicts');
    }

    // Command execution risks
    const commandActions = actions.filter(a => a.tool === 'exec');
    if (commandActions.length > 0) {
      risks.push('command_execution_failure');
    }

    // Network dependency risks
    const networkActions = actions.filter(a => a.type === 'install_package');
    if (networkActions.length > 0) {
      risks.push('network_dependency');
    }

    return risks;
  }

  /**
   * Simulate thinking time based on effort level
   */
  async simulateThinking() {
    const thinkingTime = this.currentConfig.thinkingTime;
    if (thinkingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * thinkingTime));
    }
  }

  /**
   * Finalize reasoning and prepare result
   */
  finalizeReasoning(state, duration) {
    return {
      id: state.id,
      input: state.input,
      effort: this.effort,
      complexity: state.complexity,
      plan: state.plan,
      actions: state.actions,
      reflections: state.reflections,
      errors: state.errors,
      iterations: state.iteration,
      duration,
      tokensUsed: this.estimateTokenUsage(state),
      confidence: this.calculateConfidence(state),
      status: state.errors.length > 0 ? 'completed_with_errors' : 'completed',
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        config: this.currentConfig
      }
    };
  }

  /**
   * Estimate token usage for reasoning
   */
  estimateTokenUsage(state) {
    let tokens = 0;
    
    // Base reasoning tokens
    tokens += state.input.length / 4; // Rough estimate: 4 chars per token
    
    // Planning tokens
    if (state.plan) {
      tokens += 500; // Planning overhead
    }
    
    // Reflection tokens
    tokens += state.reflections.length * 200;
    
    // Action planning tokens
    tokens += state.actions.length * 50;
    
    return Math.round(tokens);
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(state) {
    let confidence = 0.8; // Base confidence
    
    // Reduce confidence for errors
    confidence -= state.errors.length * 0.1;
    
    // Reduce confidence for high complexity without planning
    if (state.complexity?.level === 'high' && !state.plan) {
      confidence -= 0.2;
    }
    
    // Increase confidence for successful planning
    if (state.plan && state.actions.length > 0) {
      confidence += 0.1;
    }
    
    // Increase confidence for reflection
    if (state.reflections.length > 0) {
      confidence += 0.05;
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Update reasoning configuration
   */
  async updateConfig(newConfig) {
    if (newConfig.effort && this.effortConfigs[newConfig.effort]) {
      this.effort = newConfig.effort;
      this.currentConfig = this.effortConfigs[this.effort];
    }
    
    if (newConfig.maxIterations) {
      this.maxIterations = newConfig.maxIterations;
      this.currentConfig.maxIterations = newConfig.maxIterations;
    }
    
    if (newConfig.enableReflection !== undefined) {
      this.enableReflection = newConfig.enableReflection;
    }
    
    if (newConfig.enablePlanning !== undefined) {
      this.enablePlanning = newConfig.enablePlanning;
    }

    if (this.logger) {
      this.logger.info('Reasoning engine configuration updated', newConfig);
    }
  }

  /**
   * Get reasoning engine status
   */
  getStatus() {
    return {
      effort: this.effort,
      maxIterations: this.maxIterations,
      enableReflection: this.enableReflection,
      enablePlanning: this.enablePlanning,
      currentConfig: this.currentConfig
    };
  }
}

module.exports = ReasoningEngine;