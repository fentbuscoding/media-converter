# contributing to media converter

thanks for considering contributing to media converter! 🎉

## how to contribute

### reporting bugs 🐛

if you find a bug, please create an issue with:
- clear description of the bug
- steps to reproduce
- expected vs actual behavior
- browser and os information
- screenshots if applicable

### suggesting features ✨

we love new ideas! create an issue with:
- clear description of the feature
- why it would be useful
- how it should work
- any examples or mockups

### submitting code 💻

1. **fork the repository**
   ```bash
   git clone https://github.com/fentbuscoding/media-converter.git
   ```

2. **create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

3. **make your changes**
   - write clean, readable code
   - follow existing code style
   - test your changes thoroughly
   - keep commits atomic and well-described

4. **commit your changes**
   ```bash
   git commit -m "add: your feature description"
   # or
   git commit -m "fix: your bug fix description"
   ```

5. **push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **create a pull request**
   - describe what you changed and why
   - reference any related issues
   - add screenshots if relevant

## development setup

### prerequisites
- node.js 16+ and npm
- python 3.8+ (for backend)
- git

### installation

1. clone the repository
   ```bash
   git clone https://github.com/fentbuscoding/media-converter.git
   cd media-converter
   ```

2. install dependencies
   ```bash
   npm install
   pip install -r requirements.txt
   ```

3. start the development servers
   ```bash
   # frontend (port 8000)
   npm run dev
   
   # backend (port 3000)
   npm start
   ```

4. open http://localhost:8000

## code style

### javascript
- use ES6+ features
- prefer `const` and `let` over `var`
- use arrow functions where appropriate
- add comments for complex logic
- keep functions small and focused

### css
- use css variables for theming
- follow BEM naming where it makes sense
- keep selectors simple
- mobile-first responsive design

### python
- follow PEP 8 style guide
- use type hints where helpful
- add docstrings to functions
- keep functions pure when possible

## commit message format

use clear, descriptive commit messages:

```
add: new feature description
fix: bug fix description
update: update existing feature
refactor: code refactoring
docs: documentation changes
style: formatting, no code change
test: adding or updating tests
chore: maintenance tasks
```

## testing

before submitting:
- test in chrome, firefox, safari, edge
- test on mobile devices
- test file conversion with various formats
- test youtube and instagram downloads
- check for console errors
- verify all links work

## pull request checklist

- [ ] code follows project style
- [ ] tested in multiple browsers
- [ ] no console errors
- [ ] commit messages are clear
- [ ] branch is up to date with main
- [ ] pr description is detailed

## questions?

- open an issue for questions
- check existing issues first
- be respectful and patient
- we're all learning!

## code of conduct

- be respectful and inclusive
- welcome newcomers
- focus on constructive feedback
- no harassment or discrimination
- keep discussions on-topic

## license

by contributing, you agree that your contributions will be licensed under the MIT license.

---

thanks for contributing! 🚀
