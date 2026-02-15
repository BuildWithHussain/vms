import path from 'path';
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import proxyOptions from './proxyOptions';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		VitePWA({
			registerType: 'autoUpdate',
			workbox: {
				navigateFallback: null,
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
			},
			manifest: {
				name: 'VMS - Video Management Solution',
				short_name: 'VMS',
				description: 'Video Management Solution by BuildWithHussain',
				theme_color: '#7c3aed',
				background_color: '#ffffff',
				display: 'standalone',
				scope: '/vms/',
				start_url: '/vms/',
				icons: [
					{
						src: 'pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png',
					},
					{
						src: 'pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
					},
					{
						src: 'pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any maskable',
					},
				],
			},
		}),
	],
	server: {
		port: 8080,
		host: '0.0.0.0',
		proxy: proxyOptions
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src')
		}
	},
	build: {
		outDir: '../vms/public/frontend',
		emptyOutDir: true,
		target: 'es2015',
	},
});
