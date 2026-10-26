# Adversarial review: authentication and editable Word export

Reviewed against `8f51d61c4f57621dea04ac0717fc47ad02706319` using synthetic local inputs.

| Finding | Before | Change and regression |
| --- | --- | --- |
| Forged proxy headers bypass login throttling | Twelve incorrect passwords with different `X-Real-IP` values all returned 401 | Budget is keyed to the socket peer; attempts 11–12 return 429 |
| Word exports an old formula after a TeX edit | Changing `x+1` to `x+2` retained the previous OMML, and verification reported a source match | Both export and verification require the bounded OMML conversion to match current TeX; unreconciled edits fail explicitly |
| Caller-provided OMML can carry active Word content | A matching SHA-256 admitted fields, objects, alternate chunks and hyperlinks | An inert element/attribute allowlist rejects these nodes and entity declarations while retaining mathematical content, bookmarks and font formatting |
| UNO macro policy used the wrong constant | `MacroExecutionMode=4` means always execute without warning | Use `0`, meaning never execute; configuration regression covers the actual isolated loader payload |

The macro constants are defined by the [LibreOffice SDK](https://api.libreoffice.org/docs/idl/ref/namespacecom_1_1sun_1_1star_1_1document_1_1MacroExecMode.html). The XML tests demonstrate unsafe package insertion, not successful macro execution or host compromise. Native UNO execution was unavailable on the local macOS test host; the existing Linux journal CI exercises the full Word pipeline.

Two prior local publishing fixes are included: default book headers/footers no longer override journal running heads, and upright Greek falls back to Times New Roman when FreeSerif is absent. Explicit custom running heads remain supported. The header/footer correction overlaps the related change in PR #4.

## Validation

```sh
cd web
npm test
node standalone/build.mjs
python journal-engine/run_tests.py
```

Targeted tests are `tests/auth-adversarial.test.mjs`, `journal-engine/tests/test_word_adversarial.py`, and `journal-engine/tests/test_journal_header_defaults.py`. The existing Word compatibility fixture now updates its TeX when changing its source; a separate negative test preserves the mismatched-source case.

A private real-document check additionally exported and verified 295 native math elements, 7 tables, 7 images and 319 editable text segments. No manuscript or private fixture is committed.

## Limits and behavior changes

- Reverse-proxy deployments share a socket-peer login budget until an explicit trusted-proxy policy is implemented. Untrusted forwarding headers cannot opt a request into another budget.
- Formula reconciliation is intentionally exact after surrounding whitespace is removed. A TeX edit, including a cosmetic edit, may require regenerated source before Word export. The application must never silently deliver an older formula.
- The review covered authentication, owner/revision boundaries, bounded import and TeX paths, and Word source handling. It is not a penetration-test certification or a claim that all product vulnerabilities have been eliminated.
