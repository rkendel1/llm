# Contributing to LLM

Thank you for your interest in contributing! This document provides guidelines and instructions for getting started.

## Development Setup

### Prerequisites
- Node.js 20+ (LTS or later)
- npm 10+
- Git

### Installation
```bash
git clone https://github.com/rkendel1/llm.git
cd llm
npm install
```

### Build & Test
```bash
# Type check
npm run typecheck

# Build
npm run build

# Run tests
npm test

# Watch mode for development
npm run test:watch
```

## Project Structure

```
llm/
├── src/                      # Main package entry point
├── packages/
│   ├── cli/                  # Command-line interface
│   ├── core/                 # Runtime engine
│   ├── providers/            # Provider adapters
│   ├── router/               # Model selection logic
│   ├── registry/             # Model metadata
│   ├── registry-ingest/      # Data pipeline
│   ├── secrets/              # Credential management
│   ├── proxy/                # OpenAI-compatible proxy
│   └── certification/        # Test suite
├── test/                     # Integration tests
├── .github/workflows/        # CI/CD pipelines
└── package.json              # Workspace configuration
```

## Making Changes

### Creating a Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### Code Style
- TypeScript with strict mode enabled
- No linting configured yet (ESLint coming soon)
- Format code with clean, readable style
- Prefer explicit types over inference in public APIs

### Testing
- Write tests for new features
- Ensure all tests pass: `npm test`
- Aim for meaningful test coverage

### Commit Messages
```
type(scope): description

Detailed explanation if needed.

Fixes #123 (if applicable)
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Submitting Changes
1. Push to your branch
2. Open a Pull Request with:
   - Clear title and description
   - Reference to related issues
   - Summary of changes
   - Any breaking changes noted

## Registry Ingestion Development

The `@llm/registry-ingest` package handles:
- **Sources**: Fetching model data from provider APIs
- **Adapters**: Converting vendor formats to canonical format
- **Normalization**: Standardizing pricing, capabilities, and metadata
- **Verification**: Validation and consistency checks
- **Publishing**: Snapshot generation and distribution

### Testing Registry Changes
```bash
npm run test -- packages/registry-ingest/test
```

### Manual Ingestion Run
```bash
npm run build
npm run ingest:registry
```

## CI/CD Pipelines

### Automated Workflows
- **CI** (`ci.yml`): Runs on every push and PR
  - Type checking
  - Build verification
  - Test suite
  - Coverage upload

- **Registry Ingestion** (`ingest-registry.yml`): Runs daily and on-demand
  - Fetches from provider sources
  - Normalizes data
  - Creates PR if changes detected

- **Publish** (`publish.yml`): Runs on version tags
  - Validates build
  - Tests
  - Publishes to npm
  - Creates GitHub release

## Release Process

1. Update version in package.json
2. Add changes to CHANGELOG.md
3. Create a git tag: `git tag v1.0.0`
4. Push: `git push origin v1.0.0`
5. GitHub Actions will publish automatically

## Reporting Issues

- Use GitHub Issues for bug reports
- Include:
  - Clear reproduction steps
  - Expected vs actual behavior
  - Node.js version
  - npm version
  - Relevant provider information

## Questions?

- Check existing issues and PRs
- Review the README and documentation
- Open a discussion issue

Thank you for contributing! 🚀
