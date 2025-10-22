import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/kit/vite';

const config = {
  kit: {
    adapter,
    alias: {
      $lib: 'src/lib',
      $stores: 'src/lib/stores',
      $workers: 'src/lib/workers'
    }
  },
  preprocess: [vitePreprocess()]
};

export default config;
