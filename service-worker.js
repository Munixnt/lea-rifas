"use strict";

const CACHE_NAME = "lea-rifas-shell-v1";
const APP_SHELL = [
    "./",
    "./index.html",
    "./campanha.html",
    "./entrar.html",
    "./minhas-dezenas.html",
    "./painel.html",
    "./styles.css",
    "./app.js",
    "./pwa.js",
    "./campaigns-page.js",
    "./campaign-page.js",
    "./auth-page.js",
    "./reservations-page.js",
    "./manager-page.js",
    "./supabase-config.js",
    "./manifest.webmanifest",
    "./icon.ico",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./logo-transparent.png",
    "./logo.png",
    "./avatar.png",
    "./poster-logo.png",
    "./poster-title.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL.map((path) => new Request(new URL(path, self.registration.scope), { cache: "reload" })));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.filter((name) => name.startsWith("lea-rifas-shell-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;

    if (request.mode === "navigate") {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, response.clone());
                }
                return response;
            } catch (error) {
                const cachedPage = await caches.match(request, { ignoreSearch: true });
                if (cachedPage) return cachedPage;
                const offlineHome = await caches.match(new URL("./index.html", self.registration.scope).href);
                if (offlineHome) return offlineHome;
                throw error;
            }
        })());
        return;
    }

    event.respondWith((async () => {
        try {
            const response = await fetch(request);
            if (response.ok) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, response.clone());
            }
            return response;
        } catch (error) {
            const cachedResponse = await caches.match(request, { ignoreSearch: true });
            if (cachedResponse) return cachedResponse;
            throw error;
        }
    })());
});
