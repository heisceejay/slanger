// Minimal ambient declarations for Node.js globals used in this package.
// Full @types/node not available in offline build; declare what we need.
declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
