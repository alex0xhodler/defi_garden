# 015 build notes

- Single-line change at planner.js:1592 (`doWaitlistShare`), exactly per spec. No deviations.
- Param name `ref` chosen over `referral` to match the existing convention in app.js:2144 (`url.searchParams.set('ref', 'defi.garden')`). Confirmed no decode-side reads `referral`/`ref` from the URL in planner.js, so no receiving-side change is needed.
- Deliberately did NOT carry plan state in this share — spec scoped it out (005 owns plan-carrying shares); this is redirect hygiene only.
- Verification: `node --check planner.js` clean; grep confirms bad apex/path pattern gone (0) and canonical `?ref=` pattern present (1); full 4-file test chain exits 0. planner.js is a browser script (window/React), so the tweet-URL string is verified by inspection + grep rather than a node unit test.
