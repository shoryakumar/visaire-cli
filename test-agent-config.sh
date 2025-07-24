#!/bin/bash

# Test script to verify agent configuration behavior

echo "🧪 Testing Agent Configuration Behavior"
echo "========================================"

# Test 1: Agent enabled by default
echo ""
echo "Test 1: Default behavior (agent should be enabled)"
echo "Expected: Should use visaire agent mode"
echo "Command: node bin/visaire.js --dry-run 'test prompt'"
echo ""

# Test 2: Agent explicitly disabled
echo "Test 2: Agent explicitly disabled"
echo "Expected: Should NOT use agent mode"
echo "Command: node bin/visaire.js --no-agent --dry-run 'test prompt'"
echo ""

# Test 3: Check if configuration file respects agent.enabled = false
echo "Test 3: Configuration file with agent.enabled = false"
echo "Creating test config..."

# Create a temporary config with agent disabled
TEST_CONFIG_PATH="$HOME/.visairerc.test"
cat > "$TEST_CONFIG_PATH" << EOF
{
  "defaultProvider": "claude",
  "agent": {
    "enabled": false,
    "confirmationEnabled": false,
    "autoApprove": true,
    "maxActionsPerPrompt": 10
  }
}
EOF

echo "Test config created at $TEST_CONFIG_PATH"
echo "Expected: Should NOT use agent mode when config has agent.enabled = false"
echo ""

# Cleanup
echo "Cleaning up test config..."
rm -f "$TEST_CONFIG_PATH"

echo "✅ Test script completed"
echo ""
echo "Manual verification needed:"
echo "1. Run with default settings - should show 'Visaire agent mode enabled'"
echo "2. Run with --no-agent - should NOT show agent mode messages"
echo "3. Set config agent.enabled = false - should NOT use agent mode"