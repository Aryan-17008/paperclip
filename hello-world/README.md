# Hello World

A simple Hello World module created as part of **GEN-7**.

## Files

- `hello.ts` — TypeScript hello world module with `helloWorld()` and `hello(name)` functions.

## Usage

```bash
npx tsx hello.ts
```

Or import in your code:

```typescript
import { helloWorld, hello } from "./hello";

console.log(helloWorld()); // "Hello, World!"
console.log(hello("Paperclip")); // "Hello, Paperclip!"
```
