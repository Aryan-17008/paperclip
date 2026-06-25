// Simple Hello World program for Paperclip
// Created by QA Lead as part of GEN-7

function helloWorld(): string {
  return "Hello, World!";
}

function hello(name: string = "World"): string {
  return `Hello, ${name}!`;
}

// Main execution
if (import.meta.main) {
  console.log(helloWorld());
  console.log(hello("Paperclip"));
}

export { helloWorld, hello };
