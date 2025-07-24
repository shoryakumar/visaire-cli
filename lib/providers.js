const axios = require('axios');
const Utils = require('./utils');

/**
 * LLM Provider implementations for Claude, Gemini, and GPT
 */
class Providers {
  constructor(config = {}) {
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Make API call to Claude (Anthropic)
   */
  async callClaude(apiKey, prompt, options = {}) {
    const url = 'https://api.anthropic.com/v1/messages';
    
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };

    const model = this.getModelForProvider(options.model, 'claude');
    const data = {
      model: model,
      max_tokens: options.maxTokens || 4000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    };

    try {
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers,
        data,
        timeout: this.timeout
      });

      // Extract content from Claude's response format
      if (response.data && response.data.content && response.data.content[0]) {
        return response.data.content[0].text;
      } else {
        throw new Error('Unexpected response format from Claude API');
      }
    } catch (error) {
      throw this.handleProviderError(error, 'Claude');
    }
  }

  /**
   * Make API call to GPT (OpenAI)
   */
  async callGPT(apiKey, prompt, options = {}) {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    const model = this.getModelForProvider(options.model, 'gpt');
    const data = {
      model: model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7
    };

    try {
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers,
        data,
        timeout: this.timeout
      });

      // Extract content from OpenAI's response format
      if (response.data && response.data.choices && response.data.choices[0]) {
        return response.data.choices[0].message.content;
      } else {
        throw new Error('Unexpected response format from OpenAI API');
      }
    } catch (error) {
      throw this.handleProviderError(error, 'GPT');
    }
  }

  /**
   * Make API call to Gemini (Google)
   */
  async callGemini(apiKey, prompt, options = {}) {
    const model = this.getModelForProvider(options.model, 'gemini');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const headers = {
      'Content-Type': 'application/json'
    };

    const data = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: options.temperature || 0.7,
        topK: options.topK || 40,
        topP: options.topP || 0.95,
        maxOutputTokens: options.maxTokens || 4000
      }
    };

    try {
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers,
        data,
        timeout: this.timeout
      });

      // Extract content from Gemini's response format
      if (response.data && response.data.candidates && response.data.candidates[0]) {
        const candidate = response.data.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts[0]) {
          return candidate.content.parts[0].text;
        }
      }
      
      throw new Error('Unexpected response format from Gemini API');
    } catch (error) {
      throw this.handleProviderError(error, 'Gemini');
    }
  }

  /**
   * Generic method to call any provider
   */
  async call(provider, apiKey, prompt, options = {}) {
    // Validate inputs
    if (!provider || !apiKey || !prompt) {
      throw new Error('Provider, API key, and prompt are required');
    }

    if (!Utils.validateApiKey(apiKey, provider)) {
      throw new Error(`Invalid API key format for ${provider}`);
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      throw new Error('Prompt cannot be empty');
    }

    // Call the appropriate provider method
    switch (provider.toLowerCase()) {
      case 'claude':
        return await this.callClaude(apiKey, trimmedPrompt, options);
      
      case 'gpt':
        return await this.callGPT(apiKey, trimmedPrompt, options);
      
      case 'gemini':
        return await this.callGemini(apiKey, trimmedPrompt, options);
      
      default:
        throw new Error(`Unsupported provider: ${provider}. Supported providers: claude, gpt, gemini`);
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  async makeRequest(url, config, retryCount = 0) {
    try {
      return await axios(url, config);
    } catch (error) {
      // Retry on network errors or 5xx server errors
      const shouldRetry = retryCount < this.maxRetries && (
        !error.response || 
        error.response.status >= 500 ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT'
      );

      if (shouldRetry) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        Utils.logWarning(`Request failed, retrying in ${delay}ms... (${retryCount + 1}/${this.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(url, config, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Handle and format provider-specific errors
   */
  handleProviderError(error, provider) {
    const formattedMessage = Utils.formatError(error, provider);
    
    // Add provider-specific context
    let contextualMessage = formattedMessage;
    
    if (error.response) {
      const status = error.response.status;
      
      switch (provider) {
        case 'Claude':
          if (status === 401) {
            contextualMessage += '\nEnsure your Anthropic API key is valid and has the correct permissions.';
          }
          break;
        
        case 'GPT':
          if (status === 401) {
            contextualMessage += '\nEnsure your OpenAI API key is valid and has sufficient credits.';
          }
          break;
        
        case 'Gemini':
          if (status === 400) {
            contextualMessage += '\nCheck that your Google API key is enabled for the Gemini API.';
          }
          break;
      }
    }

    const providerError = new Error(contextualMessage);
    providerError.provider = provider;
    providerError.originalError = error;
    
    return providerError;
  }

  /**
   * Get available models for each provider
   */
  getAvailableModels(provider) {
    const models = {
      claude: [
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-3-opus-20240229'
      ],
      gpt: [
        'gpt-3.5-turbo',
        'gpt-4',
        'gpt-4-turbo-preview',
        'gpt-4-32k'
      ],
      gemini: [
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b',
        'gemini-1.0-pro-vision-latest'
      ]
    };

    return models[provider] || [];
  }

  /**
   * Get default model for each provider
   */
  getDefaultModel(provider) {
    const defaults = {
      claude: 'claude-3-sonnet-20240229',
      gpt: 'gpt-3.5-turbo',
      gemini: 'gemini-1.5-flash'
    };

    return defaults[provider] || null;
  }

  /**
   * Validate if a model is compatible with a provider
   */
  validateModelForProvider(model, provider) {
    if (!model || !provider) {
      return false;
    }

    const availableModels = this.getAvailableModels(provider);
    return availableModels.includes(model);
  }

  /**
   * Get the appropriate model for a provider, with validation
   */
  getModelForProvider(requestedModel, provider) {
    // If no model requested, use provider default
    if (!requestedModel) {
      return this.getDefaultModel(provider);
    }

    // Validate requested model is compatible with provider
    if (this.validateModelForProvider(requestedModel, provider)) {
      return requestedModel;
    }

    // If invalid model requested, log warning and use default
    Utils.logWarning(`Model '${requestedModel}' is not compatible with provider '${provider}'`);
    Utils.logInfo(`Using default model '${this.getDefaultModel(provider)}' instead`);
    
    return this.getDefaultModel(provider);
  }

  /**
   * Test API key validity for a provider
   */
  async testApiKey(provider, apiKey) {
    try {
      const testPrompt = 'Hello, please respond with "API key is working"';
      const response = await this.call(provider, apiKey, testPrompt);
      return response.toLowerCase().includes('api key is working') || response.length > 0;
    } catch (error) {
      return false;
    }
  }
}

module.exports = Providers;