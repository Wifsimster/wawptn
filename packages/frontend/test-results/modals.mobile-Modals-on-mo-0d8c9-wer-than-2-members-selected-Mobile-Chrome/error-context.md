# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]: "[plugin:vite:esbuild] Transform failed with 1 error: /home/ralph/wawptn/packages/frontend/src/lib/api.ts:35:0: ERROR: Expected identifier but found \"<<\""
  - generic [ref=e5]: /home/ralph/wawptn/packages/frontend/src/lib/api.ts:35:0
  - generic [ref=e6]: "Expected identifier but found \"<<\" 33 | }>('/auth/profile'), 34 | syncProfile: () => request<{ ok: boolean }>('/auth/profile/sync', { method: 'POST' }), 35 | <<<<<<< HEAD | ^ 36 | syncPlatform: (platformId: string) => request<{ ok: boolean }>(`/auth/${platformId}/sync`, { method: 'POST' }), 37 | syncEpic: () => request<{ ok: boolean }>('/auth/epic/sync', { method: 'POST' }),"
  - generic [ref=e7]: at failureErrorWithLog (/home/ralph/wawptn/node_modules/esbuild/lib/main.js:1467:15) at /home/ralph/wawptn/node_modules/esbuild/lib/main.js:736:50 at responseCallbacks.<computed> (/home/ralph/wawptn/node_modules/esbuild/lib/main.js:603:9) at handleIncomingPacket (/home/ralph/wawptn/node_modules/esbuild/lib/main.js:658:12) at Socket.readFromStdout (/home/ralph/wawptn/node_modules/esbuild/lib/main.js:581:7) at Socket.emit (node:events:508:28) at addChunk (node:internal/streams/readable:559:12) at readableAddChunkPushByteMode (node:internal/streams/readable:510:3) at Readable.push (node:internal/streams/readable:390:5) at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)
  - generic [ref=e8]:
    - text: Click outside, press Esc key, or fix the code to dismiss.
    - text: You can also disable this overlay by setting
    - code [ref=e9]: server.hmr.overlay
    - text: to
    - code [ref=e10]: "false"
    - text: in
    - code [ref=e11]: vite.config.ts
    - text: .
```