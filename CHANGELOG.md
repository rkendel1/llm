# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions CI/CD workflows for automated testing and publishing
- `.npmignore` for clean npm package distribution
- `CONTRIBUTING.md` guide for developers
- `SECURITY.md` vulnerability reporting policy
- Registry ingestion pipeline automation (daily + manual trigger)
- `publishConfig` for safe npm publishing
- `prepack` script to ensure build before publishing

### Changed
- Improved package.json configuration for distribution

### Fixed
- Build configuration and dependencies

## [0.1.0] - 2024-08-13

### Added
- Initial release of LLM runtime
- Core runtime engine with provider abstraction
- Six routing modes: auto, cheap, fast, reasoning, vision, local
- Provider adapters for OpenAI, Anthropic, Google, OpenRouter, Ollama
- CLI interface with setup, models, providers, status, doctor, proxy commands
- OpenAI-compatible proxy server
- Request tracing with privacy-first observability
- Cost tracking and token accounting
- Fallback logic with circuit breaker
- Tool calling and streaming support
- Structured output parsing
- Credential management with local vault
- Comprehensive test suite (89 tests)
- TypeScript strict mode
- Full ESM support
- Model registry with ingestion pipeline
- Capability-aware routing
- Rate limit awareness
- Timeout and cancellation support
- Concurrency limits

### Documentation
- Comprehensive README with examples
- Philosophy and design rationale
- API reference
- CLI documentation
- Provider configuration guides

---

## Release Strategy

### Versioning
- `0.1.0` - Initial alpha release
- `0.2.0` - First beta release (expected Q4 2024)
- `1.0.0` - Stable production release (planned for Q1 2025)

### Stability Guarantees
- `0.x` releases: API may change, breaking changes in minor versions
- `1.0+` releases: Semantic versioning with stable API

### Support Timeline
- `0.1.x`: Security patches until 0.2.0 release
- `0.2.x`: Security patches until 1.0.0 release
- `1.x.x`: LTS until superseded (minimum 2 years)

---

## How to Upgrade

### From 0.1.0 to 0.2.0 (when released)
Check release notes for any breaking changes.

### From 0.x to 1.0.0
Check `MIGRATION.md` for any breaking changes.

---

## Unreleased Changes (In Progress)

### Features in Development
- Linting and code formatting (ESLint, Prettier)
- Extended test coverage and benchmarks
- Docker configuration for development
- Troubleshooting guide
- API reference documentation
- Community examples and recipes

### Infrastructure
- Automated dependency updates (Renovate)
- Code coverage tracking
- Performance benchmarking
- Security scanning (SAST)

---

## Notes

- See `.github/workflows/` for automated release process
- See `CONTRIBUTING.md` for development guidelines
- See `SECURITY.md` for vulnerability reporting

---

[Unreleased]: https://github.com/rkendel1/llm
[0.1.0]: https://github.com/rkendel1/llm/releases/tag/v0.1.0
