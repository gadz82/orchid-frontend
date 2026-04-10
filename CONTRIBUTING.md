# Contributing to orchid-frontend

## Development Setup

```bash
cd orchid-frontend
npm install
pip install pre-commit   # or brew install pre-commit
pre-commit install
npm run dev
```

The `pre-commit install` command installs git hooks that **automatically run eslint and commitlint before every commit**.

## Commit Message Convention

This project uses **[Conventional Commits](https://www.conventionalcommits.org/)**. Every commit message must follow this format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `perf` | Performance improvement |
| `refactor` | Code refactor (no feature/fix) |
| `docs` | Documentation only |
| `style` | Formatting, whitespace |
| `test` | Adding/updating tests |
| `build` | Build system, dependencies |
| `ci` | CI/CD configuration |
| `chore` | Maintenance tasks |

### Breaking Changes

Append `!` after the type or add `BREAKING CHANGE:` in the footer:

```
feat!: redesign chat sidebar component API
```

### Examples

```
feat(chat): add file drag-and-drop upload indicator
fix(sidebar): prevent double-click creating duplicate chats
perf(messages): virtualize message list for long conversations
docs: update OAuth configuration in README
test(actions): add tests for sendChatMessage server action
ci: add vitest coverage reporting to GitLab pipeline
```

### Validation

Commit messages are validated in CI via [commitlint](https://commitlint.js.org/). To check locally:

```bash
npx @commitlint/cli --from HEAD~1
```

## Running Tests

```bash
npm run lint            # eslint
npx tsc --noEmit        # type check
npm test                # vitest
npm run test:coverage   # vitest with coverage
```

## Merge Requests

1. Create a feature branch from `main`
2. Use conventional commit messages
3. Ensure lint, type-check, and tests pass
4. Keep MRs focused -- one feature or fix per MR
