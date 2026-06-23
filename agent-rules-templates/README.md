# Agent Rules Generator Architecture

## Goals

- Shared rules are canonical cross-project constraints and are copied without project-specific mutation.
- Project rules are generated from repository facts and explicit policy answers.
- Every generated fact is traceable, classifiable, and time-bounded.
- Missing information produces partial configuration, not invented certainty.
- The generator runs on Node.js 12 or newer and has no third-party runtime dependencies.

## Layers

1. `shared/*.md`: canonical enterprise rules. Common templates apply to all projects; frontend/backend templates are selected by project scope.
2. Repository scanner: technology-agnostic evidence collection.
3. `project-facts.json`: machine-readable facts, evidence, confidence, answers, and module coverage.
4. `project-*.md`: human-readable project facts and policy rules.
5. `project-index.md`: routing and computed module status.
6. `project-custom.md`: manually maintained rules that the generator never overwrites.

When `project-facts.json` already exists, repository facts are rescanned while prior `user-confirmed` answers are preserved as wizard defaults.

## Fact Statuses

- `confirmed`: directly proven by repository files, configuration, or Git metadata.
- `user-confirmed`: explicitly confirmed during the interactive wizard.
- `inferred`: recommended default or structural inference that still needs validation.
- `undefined`: no reliable answer is available.

## Module Statuses

- `configured`: the coverage catalog is structurally complete.
- `partial`: at least one required item is inferred or undefined.
- `ignored`: the user explicitly skipped the module.
- `unconfigured`: no module decision or reliable data exists.

Each module also reports strategy configuration, repository-fact confirmation, and business-contract confirmation separately. Structural coverage does not claim that business semantics are correct.

## Extension Rules

- Add scanners only when evidence can be tied to a file, command, or repository metadata.
- Do not turn current implementation behavior into desired policy automatically.
- Do not infer protected branches from the current branch alone.
- Do not claim a command exists unless project configuration or an ecosystem-standard toolchain proves it.
- Keep project-specific answers out of shared templates.
- Frontend-only rules should stay in `shared-ui-rules.md`; backend-only rules should stay in `shared-backend-*.md`; truly cross-project rules should avoid frontend/backend-specific wording.

## Verification

Run:

```bash
npx agent-rule-cli --verify
```

CI can require completeness with:

```bash
npx agent-rule-cli --verify --strict
```

Verification checks JSON schema, duplicate IDs, legal statuses, coverage catalog alignment, shared template hashes, evidence content hashes, generated artifact hashes, current branch drift, partial modules, and fact age.
