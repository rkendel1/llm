# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please **do not** open a public issue. Instead, please follow responsible disclosure:

### Secure Reporting
1. Email security concerns to: randy@kendelconsulting.com
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any proof-of-concept code (if applicable)
3. We will acknowledge receipt within 24 hours
4. We will provide updates on progress every 48 hours

### What to Expect
- We aim to patch critical vulnerabilities within 7 days
- High severity issues within 14 days
- Medium severity issues within 30 days
- Low severity issues at next release

## Security Features

### Credential Management
- Credentials are stored in a local, encrypted vault
- No credentials are transmitted in request payloads
- Support for environment variables and secure credential storage

### Privacy-First Observability
- Request tracing captures no prompt data
- Usage metrics track tokens and costs only
- No model outputs are stored or logged

### Input Validation
- Request payloads validated before execution
- Provider API responses validated
- Structured output parsing with type safety

### Provider Integration
- Each provider adapter is isolated
- Provider errors don't leak sensitive data
- Fallback logic prevents cascade failures

## Compliance

### API Key Handling
- Keys are never logged
- Keys are stored only in system keyring when available
- Keys support rotation via `llm setup`

### Data Retention
- No request/response data persisted
- Only usage metrics retained (configurable)
- Audit log available for debugging (opt-in)

## Dependencies

We regularly update dependencies to patch security vulnerabilities. Check `package.json` for current versions.

### Dependency Security
- Use `npm audit` to check for vulnerabilities
- Critical vulnerabilities addressed immediately
- High vulnerabilities addressed within 48 hours

## Recommendations for Users

### Best Practices
1. Keep your `llm` package updated
2. Use strong API keys from all providers
3. Store credentials in system keyring when available
4. Don't commit `.env` files or credentials
5. Use environment variables for sensitive data
6. Rotate API keys periodically

### Production Deployment
1. Use managed credential services (AWS Secrets Manager, etc.)
2. Enable request tracing for audit trails
3. Monitor provider rate limits and costs
4. Use environment-specific credentials
5. Implement request timeouts and concurrency limits

## Bug Bounty

At this time, we do not have a formal bug bounty program. However, we greatly appreciate responsible disclosure and will credit security researchers appropriately.

## Questions?

For security questions, email randy@kendelconsulting.com

Thank you for helping keep our community safe! 🔒
