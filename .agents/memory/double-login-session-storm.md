---
name: Double login → 401 storm
description: Why duplicate POST /api/login calls break every in-flight request right after sign-in
---

Submitting login twice in quick succession (e.g. a manual fetch plus a mutation) makes passport regenerate the session on the second login, destroying the sid the first login issued. Every request already in flight with the first sid (dashboard queries, `<img>` thumbnails/sprites) gets 401/403 and stays failed until refresh, because queries use `retry: false`.

**Why:** passport 0.6+ session-fixation protection destroys the old session inside `req.login()`; the browser cookie jar only updates when the second response lands.

**How to apply:** login (and register) must go through exactly one request path. Symptom to recognize: burst of 401 `{"message":"Unauthorized"}` on authed GETs immediately after a 200 login.

Related: never log request/response bodies in the shared API client — the login body contains the plaintext password and ends up in consoles and pasted bug reports.
