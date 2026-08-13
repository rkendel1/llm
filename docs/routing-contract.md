# Routing Contract v1

1. Unsupported required capabilities are never selected.
2. Unknown capabilities remain distinct from unsupported capabilities.
3. Fallback routes preserve every original capability requirement.
4. Routes without available credentials or a local runtime are not executable candidates.
5. Retryable failures may trigger fallback and remove the failed route before re-ranking.
6. Non-retryable failures are not blindly retried.
7. Runtime observations never mutate the canonical registry.
8. Identical registry, observations, credentials, request, and policy produce an identical decision.
9. Unknown pricing is never treated as free.
10. Unknown route health is never described as healthy.
11. An explanation corresponds to the decision that execution receives.
12. Registry version and checksum are part of routing provenance.

`llm evaluate` certifies these invariants with constraint-based scenarios. It does not pin dynamic registries to exact model names and does not use an LLM to judge its own routing.
