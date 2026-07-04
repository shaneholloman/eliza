/** Provides an Electron stub for agent tests that run outside a desktop shell. */
export const __electronTestState = {
  appPath: "",
  isPackaged: true,
};

export const app = {
  get isPackaged(): boolean {
    return __electronTestState.isPackaged;
  },
  getAppPath(): string {
    return __electronTestState.appPath;
  },
};

export const ipcMain = {
  handle: () => undefined,
};
