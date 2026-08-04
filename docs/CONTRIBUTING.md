# Contributing

## Coding standards

- TypeScript everywhere, strict mode. Avoid `any` unless truly unavoidable.
- Prefer interfaces over loose/inline object types.
- Keep functions small — one function does one thing. One file = one responsibility.
- Never create "God Components" or "God Functions."
- All business logic lives in `services/` — never in UI components or controllers.

## Naming conventions

- Components: `PascalCase` (`PreviewCard.tsx`)
- Functions/variables: `camelCase` (`validatedUrl`, `downloadResponse`)
- Routes: `kebab-case` (`/api/v1/fetch-media`)
- Use meaningful names always — never `data`, `temp`, `item`.

## Comments

Avoid unnecessary comments — write self-explanatory code. Comment only complex business logic (e.g. scraper fallback decision trees).

## Git

- Meaningful commit messages.
- Each feature = one independent commit.
- Never mix unrelated changes in a single commit.

## Reusability rule

If UI code is repeated more than once, it becomes a reusable component immediately (see `apps/web/src/components/ui`).

## Documentation

Every major change must update the relevant file in `docs/`. Documentation is written before and during development, not after.
