# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]: "[plugin:vite:json] Failed to parse JSON file, invalid JSON syntax found at position 8508"
  - generic [ref=e5]: /home/ralph/wawptn/packages/frontend/src/i18n/locales/en.json:214:25
  - generic [ref=e6]: "212 | \"syncError\": \"Sync error\", 213 | \"disconnect\": \"Disconnect\", 214 | \"connect\": \"Connect\", | ^ 215 | <<<<<<< HEAD 216 | \"reconnect\": \"Reconnect\","
  - generic [ref=e7]: at TransformPluginContext._formatLog (file:///home/ralph/wawptn/node_modules/vite/dist/node/chunks/config.js:28999:43) at TransformPluginContext.error (file:///home/ralph/wawptn/node_modules/vite/dist/node/chunks/config.js:28996:14) at TransformPluginContext.handler (file:///home/ralph/wawptn/node_modules/vite/dist/node/chunks/config.js:8890:11) at EnvironmentPluginContainer.transform (file:///home/ralph/wawptn/node_modules/vite/dist/node/chunks/config.js:28797:51) at async loadAndTransform (file:///home/ralph/wawptn/node_modules/vite/dist/node/chunks/config.js:22670:26) at async viteTransformMiddleware (file:///home/ralph/wawptn/node_modules/vite/dist/node/chunks/config.js:24542:20)
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