# Handwritten proofmark review bridge

The editor's **笔迹复核** button accepts an existing recognizer's `proofmark-review/0.2` candidate packet and its original PNG/JPEG photos. It provides image overlays, editable transcription, named human decisions and a downloadable review draft. It does not run inference or change the manuscript.

## Try it

1. Open the editor and click **笔迹复核**.
2. Import `web/tests/fixtures/proofmark/synthetic-review.json`.
3. Select `synthetic-proof.png` from the same directory. The image's SHA-256 and dimensions must match the packet before a decision can be recorded.
4. Enter a reviewer name, inspect the marked region, correct the transcription if necessary, and select **转写已核对** or **排除此条**.
5. Export the draft. The original candidate, human text, evidence-verification state, reviewer, timestamp and item digest remain separate.

The fixture is synthetic. It demonstrates integration, not recognition accuracy. Existing packets with multiple photos and candidates are supported. Photos without original Word/PDF files remain unbound examples.

## Boundary and data contract

- Input requires `schema_version: "proofmark-review/0.2"`, `packet_kind: "review_draft"`, `executable: false`, a batch ID, assets and candidates. Asset hashes, dimensions, page-segment references, candidate IDs and normalized `[x0,y0,x1,y1]` coordinates are validated. Limits: 2 MiB JSON, 32 photos, 200 candidates; each photo is at most 12 MiB, 12,000 pixels on either side and 30 million pixels.
- Import treats every candidate as pending, including packets claiming prior approval or source binding. Model text is rendered with DOM text APIs. Packet paths are never fetched. SVG is not accepted. EXIF-rotated JPEGs require producer-side normalization and a regenerated packet.
- A decision requires a verified photo and a named reviewer. Editing text or notes invalidates the decision. **Checked** only means a human checked the transcription; it does not approve a proposed manuscript operation.
- Output is the distinct `shuye-proofmark-review/0.1` protocol with `packet_kind: "human_review_draft"`, `executable: false` and `source_binding: null`. Document fingerprints provide context, not authorization. Model proposals remain inert source evidence.
- Images and transient review state stay in the browser. Nothing is sent to a model service, saved to the project API or embedded in the Word/PDF document. JSON exports include the original packet's metadata, so reviewers should handle the draft with the same care as its input.
- Closing the panel retains the session until the page reloads. Export is currently for handoff/archive; resuming an exported human-review draft is not supported. Importing another candidate packet replaces the current review. This limitation is shown in the empty-state message.

`proofmark-reference-review/0.1` is a reference-labeling/evaluation format, not a candidate packet, and is deliberately rejected. A later adapter should preserve that distinction rather than converting reference annotations into apparently model-generated edits.

## Next integration stages

1. **Recognition adapter:** an authenticated, owner-scoped server job receives normalized image assets, calls an explicitly configured local or hosted model, and emits the candidate protocol with model/version, prompt/response hashes and image identity. Keep credentials server-side, impose resource/time limits, support cancellation and preserve raw responses. The current browser bridge establishes the input contract without adding an unauthenticated inference endpoint.
2. **Source binding:** attach document ID, revision, source hash and proof hash; resolve a candidate to an exact block/range or formula token. Image coordinates alone cannot authorize a source edit. With no original manuscript, this stage remains unavailable.
3. **Reviewed operations:** produce a small operation allowlist, present the before/after diff, require an explicit human choice and reject stale revisions or ambiguous targets. Apply changes transactionally, retain undo/history and re-run the relevant PDF/Word preflight. Formula style changes must preserve semantics and source reconciliation.
4. **Quality gate:** use a frozen, human-reviewed corpus with separate measures for transcription, region localization, symbol/style interpretation and false edits. A working UI or synthetic fixture is not evidence that the recognizer is accurate enough for automatic correction.

## Verification

`node --test tests/proofmark-review.test.mjs` covers forged approvals/bindings, executable packets, malformed geometry/references, image tampering and bounds, EXIF rotation, text changes invalidating approval, no network access, detached exports and no document mutation. Full `npm test`, framework build and standalone build are also required.

Browser acceptance: import → reject a tampered photo → verify the original → record a human decision → edit and invalidate it → export → verify the project document and revision are unchanged. Also test an executable packet rejection and HTML-like transcription displayed literally without creating DOM elements.
