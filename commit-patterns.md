## Commit naming

Format: `type: message`

Subject: one line, lowercase message, no period at the end, no scope.
Description: **required** — see the 🚨 TODO block below.

### Types (from most to least used)

| type    | when                                                         |
| ------- | ------------------------------------------------------------ |
| `fix`   | bug fix                                                      |
| `upd`   | update existing behavior/code (not a new feature, not a fix) |
| `style` | UI/CSS only change, no logic change                          |
| `docs`  | changes to files in `docs/` or `dev_readme-*.md`             |
| `feat`  | new feature                                                  |
| `chore` | renames, cleanup, types, logs, imports, non-behavior changes |

### Examples

- `fix: check spam email tg ntfcn`
- `fix: change lang via dropdown (no cookie)`
- `style: fix meeting info jumping`
- `style: green add product btn`
- `upd: J.png is now png (more rich)`
- `upd: max 300 chars in desc`
- `docs: no jargon`
- `feat: AI iteration mode`
- `-chore: night-run.sh`
- `chore: getCached -> getRedis`
- `chore: err -> error`
- `chore: eslint fix imports-order`

## 🚨 TODO — every description opens with this

A commit that only says what changed leaves me opening the diff to find out whether a manual step is
waiting. The description answers that first.

```
chore: check envs are valid

🚨 TODO

1. open dev_readme-supbase-sql.md:878 -> copy the ## Keys check cron block -> open the Supabase
   SQL editor -> replace YOUR_PRODUCTION_DOMAIN -> run it
2. Vercel -> Settings -> Environment Variables -> Production -> add CRON_SECRET
3. curl the webhook -> expect {"ok":true} -> send it twice, the second answers skipped
```

**Each item is a chain, never a bare command.** `1. supabase functions deploy sendTgNtfcnAppointment`
is rejected: it says nothing about where to run it, what it changes, or how to tell it worked. An
item names WHERE to go, WHAT to do there, and HOW you know it worked.

**Nothing to do is still a description:**

```
🚨 TODO

1. nothing - applied and verified here
```

### Enforced, not remembered

`~/.claude/hooks/commit-rule-emoji-guard.py` denies the `git commit` before git runs when the body is
missing, does not open with `🚨 TODO`, holds no numbered items, or holds an item with no arrow chain
and no file / url / `command` / "button" in it.

### Rules

1. Keep the subject short - one line, plain words, no jargon (see code-patterns Naming conventions).
2. Renames go `old -> new` (e.g. `chore: fetch -> refetch/select/get`).
3. Don't prefix the message with a leading `-` (e.g. `-upd:`, `-chore:`) - this has slipped into history but is a typo, not a convention. Just use `type: message`.
4. Don't invent new types - if none of the 6 fit, ask before adding one.
5. No scopes (no `fix(dialer): ...`).
6. Every description opens with the `🚨 TODO` block above - this is a hard rule, not a preference.
7. A kebab-case name followed by `:` in the body IS an eslint rule name, so that line starts with 🟣
   (e.g. `🟣 imports-order:`).
8. Never add a Claude/Anthropic co-author trailer.
