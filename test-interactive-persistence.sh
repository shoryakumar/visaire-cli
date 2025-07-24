#!/bin/bash

echo "🧪 Testing Interactive Mode Persistence"
echo "======================================="

# Create a test input file with multiple prompts
cat > interactive_test_input.txt << 'EOF'
hello there
how are you?
what is 2+2?
/help
tell me a joke
/clear
another test message
/exit
EOF

echo "📝 Test Input Commands:"
cat interactive_test_input.txt
echo ""

echo "🔄 Testing interactive mode with multiple prompts..."
echo "Expected: Should process each prompt and continue until /exit"
echo ""

# Test with input redirection
node bin/visaire.js interactive --provider gemini < interactive_test_input.txt

echo ""
echo "✅ Test completed. Interactive mode should have:"
echo "   - Processed 'hello there'"
echo "   - Processed 'how are you?'"
echo "   - Processed 'what is 2+2?'"
echo "   - Shown help with /help"
echo "   - Processed 'tell me a joke'"
echo "   - Cleared history with /clear"
echo "   - Processed 'another test message'"
echo "   - Exited with /exit"

# Clean up
rm -f interactive_test_input.txt

echo ""
echo "🎯 If all prompts were processed sequentially, interactive mode is working correctly!"