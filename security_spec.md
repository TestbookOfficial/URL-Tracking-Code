# Security Specification for Tracking URL Detector

## 1. Data Invariants
- Each user has exactly one document in `user_trackers` collection, where the document ID is the user UID.
- The `urls` field must be an array of strings representing tracking URLs.
- A user can only access their own document.

## 2. The "Dirty Dozen" Payloads
1. Injecting another user's UID as document ID.
2. Injecting non-string elements into the `urls` array.
3. Setting `urls` to a very large array (resource exhaustion).
4. Submitting a payload without `urls` field.
5. Attempting to write to `user_trackers/other_user_uid`.
6. Injecting a malicious script as a URL.
... [12 payloads required] ...

## 3. The Test Runner
- `firestore.rules.test.ts` will mock auth and verify these 12 cases.
