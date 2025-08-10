# Bot Command Test Checklist

## 🧪 Pre-Testing Setup
- [ ] Bot is running (`npm start`)
- [ ] Bot is online in Discord
- [ ] Bot has proper permissions in test channel
- [ ] Test channel is set up for commands

## 📝 Core Commands Testing

### AI & Chat Commands
- [ ] `/askgarg [question]` - Test with various questions
  - [ ] Simple question: "What is Discord?"
  - [ ] Complex question: "How do I use the pet system?"
  - [ ] Edge case: Very long question
  - [ ] Verify response is appropriate and helpful

- [ ] `/gargoracle [question]` - Test mystical responses
  - [ ] Future question: "What does my future hold?"
  - [ ] Mystical question: "What is the meaning of life?"
  - [ ] Verify response has mystical/fortune-teller tone

- [ ] `/chat` - Test chat system
  - [ ] Start a chat session
  - [ ] Send multiple messages
  - [ ] Verify conversation continuity

### Pet System Commands
- [ ] `/pet adopt [name]` - Test pet adoption
  - [ ] Valid name: "Fluffy"
  - [ ] Invalid name: "" (empty)
  - [ ] Duplicate adoption attempt
  - [ ] Verify pet is created with correct stats

- [ ] `/pet status` - Test pet status display
  - [ ] With existing pet
  - [ ] Without pet (should show appropriate message)

- [ ] `/pet` - Test pet command help
  - [ ] Verify shows available pet subcommands

### Battle System Commands
- [ ] `/battle start @user` - Test battle initiation
  - [ ] Valid user mention
  - [ ] Self-battle attempt (should be blocked)
  - [ ] Invalid user mention
  - [ ] Verify battle setup and turn system

- [ ] `/battle status` - Test battle status
  - [ ] During active battle
  - [ ] Without active battle
  - [ ] Verify shows correct battle information

- [ ] `/battle` - Test battle command help
  - [ ] Verify shows available battle subcommands

### NFT & Verification Commands
- [ ] `/verify [wallet]` - Test NFT verification
  - [ ] Valid wallet address
  - [ ] Invalid wallet address
  - [ ] Already verified wallet
  - [ ] Verify role assignment and channel access

### Admin & Utility Commands
- [ ] `/status` - Test bot status
  - [ ] Verify shows uptime, memory usage, etc.
  - [ ] Check command count and user count

- [ ] `/config` - Test configuration
  - [ ] View current config
  - [ ] Modify settings (if admin)

- [ ] `/list-documents` - Test document listing
  - [ ] With existing documents
  - [ ] Without documents
  - [ ] Verify proper formatting

- [ ] `/add-document [name] [content]` - Test document addition
  - [ ] Valid document
  - [ ] Duplicate name
  - [ ] Invalid content

- [ ] `/remove-document [name]` - Test document removal
  - [ ] Existing document
  - [ ] Non-existent document

### Admin Commands (if you have admin role)
- [ ] `/admin` - Test admin panel
- [ ] `/lockdown` - Test server lockdown
- [ ] `/unlock` - Test server unlock
- [ ] `/ticket` - Test ticket system

## 🔍 Error Handling Testing

### Invalid Inputs
- [ ] Empty command arguments
- [ ] Very long arguments
- [ ] Special characters in arguments
- [ ] Missing required parameters

### Permission Testing
- [ ] Commands without required permissions
- [ ] Admin commands as regular user
- [ ] Channel-specific permissions

### Rate Limiting
- [ ] Spam commands rapidly
- [ ] Verify rate limiting is working
- [ ] Check cooldown messages

## 📊 Performance Testing

### Response Times
- [ ] Measure response time for each command
- [ ] Note any commands that are slow (>3 seconds)
- [ ] Test with multiple users simultaneously

### Memory Usage
- [ ] Monitor bot memory usage during testing
- [ ] Check for memory leaks after extended use

## 🐛 Bug Reporting

For each issue found:
- [ ] Command name and arguments used
- [ ] Expected behavior
- [ ] Actual behavior
- [ ] Error messages (if any)
- [ ] Steps to reproduce
- [ ] Screenshots (if helpful)

## ✅ Post-Testing

- [ ] All commands working as expected
- [ ] Error handling is appropriate
- [ ] Response times are acceptable
- [ ] No memory leaks detected
- [ ] Documentation updated if needed
- [ ] Bug reports filed for any issues

---

**Test Date:** _____________
**Tester:** _____________
**Bot Version:** _____________
**Discord Server:** _____________

