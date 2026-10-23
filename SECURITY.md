# Security Policy

MyKeepSafe Ledger is an open-source, local-only app. See [PRIVACY.md](PRIVACY.md) for how it keeps financial data on the user's computer.

## Reporting a vulnerability

Please report security issues **privately** through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for security problems.

Please include:
- the version or commit you tested
- steps to reproduce
- what an attacker could do (impact)

We'll acknowledge the report, work on a fix, and credit you when it's released if you'd like.

## What counts as a vulnerability here

Anything that lets financial data leave the user's computer, or lets something other than the user read or change it. For example:
- a request to a non-local host
- a bypass of the Content Security Policy or the loopback-only model proxy
- another website reaching the local server
- script injection through imported CSV data or model output
