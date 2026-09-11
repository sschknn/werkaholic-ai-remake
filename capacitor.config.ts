import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.werkaholic.remake',
  appName: 'Werkscan',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    Camera: {
      forResult: true,
      photography: true,
      source: 'Camera',
      mediaType: 'photographs',
      direction: 'rear',
      allowEditing: false,
      quality: 80,
    },
  },
};

export default config;
