import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Memento',
    description: 'Capture and restore HTML form state - a QA/dev tool.',
    version: '0.1.0',
    permissions: ['storage', 'activeTab'],
    action: {
      default_title: 'Memento',
    },
    icons: {
      '16': 'icons/16.png',
      '24': 'icons/24.png',
      '32': 'icons/32.png',
      '48': 'icons/48.png',
      '128': 'icons/128.png',
    },
  },
});
