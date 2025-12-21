# Contributing to Climate Risk for Zillow

Thank you for your interest in contributing! This project aims to make climate risk information accessible to homebuyers, and community contributions are essential to achieving that goal.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help make climate information accessible to everyone
- Respect data sources and licensing

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing issues to avoid duplicates.

**Good bug reports include:**
- Clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots if applicable
- Browser version and extension version
- Example Zillow property URL (if relevant)

**Template:**
```markdown
## Bug Description
[Clear description of what went wrong]

## Steps to Reproduce
1. Go to [URL]
2. Click on [element]
3. See error

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happened]

## Environment
- Browser: Chrome 120
- Extension Version: 1.0.0
- Operating System: macOS 14
```

### Suggesting Features

Feature requests are welcome! Please:
- Check existing issues/discussions first
- Explain the use case and benefit
- Consider data availability and API constraints
- Think about privacy implications

### Pull Requests

#### Before You Start

1. **Check for existing issues** - Someone might already be working on it
2. **Open an issue first** - Discuss major changes before coding
3. **Fork the repository** - Work in your own fork
4. **One feature per PR** - Keep changes focused

#### Development Process

1. **Fork and clone**
   ```bash
   git clone https://github.com/YOUR-USERNAME/zillow-climate-risk.git
   cd zillow-climate-risk
   ```

2. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

3. **Make your changes**
   - Follow existing code style
   - Add comments for complex logic
   - Test on multiple properties
   - Check console for errors

4. **Test thoroughly**
   - Load extension in Chrome developer mode
   - Test on at least 3 different California properties
   - Test in different cities (inland, coastal, mountain)
   - Verify all risk types display correctly
   - Check that caching works

5. **Commit with clear messages**
   ```bash
   git commit -m "Add: Brief description of what you added"
   # or
   git commit -m "Fix: Brief description of what you fixed"
   ```

6. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

#### Pull Request Guidelines

**Your PR should include:**
- Clear description of changes
- Why the change is needed
- Any breaking changes
- Screenshots for UI changes
- Test results

**PR Template:**
```markdown
## Description
[What does this PR do?]

## Motivation
[Why is this change needed?]

## Changes Made
- [Change 1]
- [Change 2]

## Testing
- [ ] Tested on 3+ properties
- [ ] Checked console for errors
- [ ] Verified caching works
- [ ] UI displays correctly

## Screenshots
[If applicable]

## Breaking Changes
[Any breaking changes? How to migrate?]
```

## Development Guidelines

### Code Style

**JavaScript:**
- Use `const` and `let`, avoid `var`
- Use async/await over promises when possible
- Use arrow functions for callbacks
- Keep functions small and focused
- Add JSDoc comments for complex functions

**Example:**
```javascript
/**
 * Classifies wildfire risk based on CAL FIRE hazard data
 * @param {string} hazClass - Hazard class from CAL FIRE
 * @param {number} hazCode - Numeric hazard code
 * @returns {Object} Risk classification with level and details
 */
classifyWildfireRisk(hazClass, hazCode) {
  // Implementation
}
```

**CSS:**
- Use meaningful class names
- Follow existing naming conventions
- Keep specificity low
- Comment complex styles

### File Organization

```
zillow-climate-risk/
├── manifest.json           # Don't modify version manually
├── content/
│   ├── content.js         # Main logic, property detection
│   └── content.css        # Styling only
├── background/
│   └── background.js      # Keep minimal
├── utils/
│   ├── dataFetcher.js     # All API calls here
│   └── cache.js           # Caching logic only
└── popup/
    └── ...                # Extension popup UI
```

### API Integration Guidelines

When adding new data sources:

1. **Check licensing** - Ensure data is public and reusable
2. **Test CORS** - Verify browser can access the API
3. **Handle errors** - Always use try/catch
4. **Cache results** - Respect rate limits
5. **Add logging** - Use emoji prefixes (🔥 🌊 ☀️ 📈)

**Example:**
```javascript
async fetchNewRiskType(propertyData) {
  if (!propertyData.latitude || !propertyData.longitude) {
    return { available: false, level: 0, description: 'Location data unavailable' };
  }
  
  try {
    console.log('🆕 Fetching new risk data...');
    const response = await fetch(API_URL);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    return this.classifyNewRisk(data);
    
  } catch (error) {
    console.error('🆕 Error:', error);
    return { available: false, level: 0, description: 'Error fetching data' };
  }
}
```

### Testing Checklist

Before submitting a PR, verify:

- [ ] Extension loads without errors
- [ ] Works on search results page (should skip)
- [ ] Works on property detail page
- [ ] All risk types display or show appropriate message
- [ ] Links open to correct websites
- [ ] Console has no unexpected errors
- [ ] Caching works (reload page, data loads from cache)
- [ ] Tested in incognito mode
- [ ] Clear cache works (`chrome.storage.local.clear()`)

### Common Issues

**Issue:** Extension doesn't load
- Check manifest.json syntax
- Verify all file paths
- Check browser console for errors

**Issue:** API calls fail
- Check CORS restrictions
- Verify API endpoint URLs
- Check network tab in DevTools

**Issue:** Badge doesn't appear
- Check property page detection
- Verify selector for price element
- Check console for errors

## Priority Contribution Areas

We especially need help with:

### High Priority
- 🦊 **Firefox support** - Port extension to Firefox Add-ons
- 🌊 **Alternative flood data** - Find CORS-friendly API
- 📈 **Sea level rise data** - Integrate quantitative projections
- 🧪 **Testing framework** - Add automated tests

### Medium Priority
- 🗺️ **State expansion** - Add support for other states
- 📊 **Data visualization** - Add charts and graphs
- 🏗️ **Property comparison** - Compare multiple properties
- 📱 **Mobile optimization** - Improve mobile experience

### Good First Issues
- 📝 **Documentation** - Improve README, add examples
- 🎨 **UI polish** - Better icons, animations, styling
- 🌐 **Internationalization** - Add Spanish translation
- 🐛 **Bug fixes** - Check issues labeled "good first issue"

## Questions?

- 💬 Start a [Discussion](https://github.com/yourusername/zillow-climate-risk/discussions)
- 🐛 Open an [Issue](https://github.com/yourusername/zillow-climate-risk/issues)
- 📧 Email: your-email@example.com

## Recognition

Contributors will be:
- Listed in README.md
- Credited in release notes
- Thanked in project documentation

Thank you for helping make climate risk information more accessible! 🌍