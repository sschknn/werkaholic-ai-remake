import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.werkaholic.remake',
  appName: 'Werkscan',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
