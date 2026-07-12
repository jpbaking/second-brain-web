# Milestone 49 — Chat-scoped file upload (attachments)

Attach files to a chat message without touching the inbox. Files live only in
that chat's context (like the Cline VS Code extension): stored under
`dataDir/chat-uploads/<chatSessionId>/`, sent to the SDK as `userImages`
(data URIs → image blocks) or `userFiles` (filesystem paths; the local runtime
reads text content into the conversation). Cleaned up when the session is
deleted. Backlog entry: "Chat-scoped file upload (attachments)" (SDK findings
2026-07-12).

- [x] **m49-01** Server attachment store + routes: `chat-uploads` data subdir;
  `POST /api/chat/sessions/:id/uploads` (multipart, per-file size cap from
  `uploadMaxBytes`, safe filenames) storing under
  `chat-uploads/<sessionId>/<attachmentId>/<name>` and returning
  `{ id, name, bytes, kind }` (`kind` = `image` for image/* mime, else
  `file`); `DELETE /api/chat/sessions/:id/uploads/:attachmentId` removes a
  pending attachment.
  Verify: `cd app && npm test --workspace server -- chat-uploads.test.ts`
- [x] **m49-02** Wire attachments through the agent: message POST accepts
  `attachmentIds`; `AgentSessionService.sendMessage` resolves them to
  `userImages` (data URI) / `userFiles` (absolute path), passes them through
  `AgentRunner.start`/`send` (and the Cline adapter maps them onto the SDK's
  `userImages`/`userFiles` fields), and persists attachment names on the
  `user_message` event.
  Verify: `cd app && npm test --workspace server -- agent-session.test.ts chat-uploads.test.ts`
- [x] **m49-03** Cleanup: deleting a session (`DELETE /api/chat/sessions/:id`)
  and clear-all (`DELETE /api/chat/sessions`, honouring `preservePinned`)
  remove the session's `chat-uploads/<sessionId>/` directory.
  Verify: `cd app && npm test --workspace server -- chat-uploads.test.ts`
- [ ] **m49-04** Web composer: attach button (+ paperclip) uploading via the
  new endpoint, pending-attachment chips (removable) above the composer, send
  includes `attachmentIds`, and user messages in the transcript show their
  attachment names.
  Verify: `cd app && npm run lint && npm run build`
- [ ] **m49-05** Full verify + archive: lint, full test suite, build all
  green; archive this checklist, update STATUS and BACKLOG.
  Verify: `cd app && npm run lint && npm test && npm run build`
