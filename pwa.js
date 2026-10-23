(() => {
    "use strict";

    const installButton = document.querySelector("#pwa-install-button");
    let installPrompt = null;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

    if ("serviceWorker" in navigator && window.isSecureContext) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./service-worker.js").catch((error) => {
                console.error("Não foi possível habilitar o modo offline.", error);
            });
        }, { once: true });
    }

    if (!installButton || standalone || !window.isSecureContext) return;
    installButton.hidden = false;

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        installPrompt = event;
    });

    window.addEventListener("appinstalled", () => {
        installPrompt = null;
        installButton.hidden = true;
    });

    installButton.addEventListener("click", async () => {
        if (!installPrompt) {
            const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
            const instruction = isIos
                ? "Para instalar, toque em Compartilhar no navegador e escolha “Adicionar à Tela de Início”."
                : "Para instalar, abra o menu do navegador e escolha “Instalar Lea Rifas” ou “Adicionar à tela inicial”.";
            const notice = document.querySelector("#app-notice");
            if (notice) {
                notice.textContent = instruction;
                notice.className = "notice";
                notice.hidden = false;
            } else {
                window.alert(instruction);
            }
            return;
        }

        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
    });
})();
