(() => {
    "use strict";

    const state = { client: null, session: null, profile: null, ready: null };
    const $ = (selector) => document.querySelector(selector);
    const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

    function showNotice(message, type = "") {
        const notice = $("#app-notice");
        if (!notice) return;
        notice.textContent = message;
        notice.className = `notice${type ? ` ${type}` : ""}`;
        notice.hidden = !message;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[char]);
    }

    function formatMoney(value) {
        return currency.format(Number(value) || 0);
    }

    function formatNumber(value) {
        return String(value === 0 ? 0 : value).padStart(2, "0");
    }

    function formatDate(value) {
        if (!value) return "";
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
    }

    function campaignLink(id) {
        return new URL(`./campanha.html?campanha=${encodeURIComponent(id)}`, location.href).href;
    }

    async function shareCampaign(id) {
        const link = campaignLink(id);
        try {
            await navigator.clipboard.writeText(link);
            showNotice("Link da campanha copiado. Envie-o aos participantes.", "success");
        } catch {
            window.prompt("Copie o link da campanha:", link);
        }
    }

    function updateAccount() {
        const name = state.profile?.display_name || state.session?.user?.user_metadata?.phone || state.session?.user?.phone || state.session?.user?.email || "Visitante";
        const accountName = $("#account-name");
        const authLink = $("#auth-link");
        if (accountName) accountName.textContent = state.session ? name : "Visitante";
        if (authLink) {
            authLink.textContent = state.session ? "Sair" : "Entrar";
            authLink.href = state.session ? "#" : "./entrar.html";
        }
        const managerNav = $("#manager-nav");
        if (managerNav) managerNav.classList.toggle("hidden", state.profile?.role !== "admin");
    }

    async function loadProfile() {
        if (!state.session) {
            state.profile = null;
            updateAccount();
            return;
        }
        const { data, error } = await state.client.from("profiles")
            .select("id, display_name, phone, role").eq("id", state.session.user.id).maybeSingle();
        if (error) throw error;
        state.profile = data;
        updateAccount();
    }

    async function syncSession(session) {
        state.session = session;
        try {
            await loadProfile();
            updateAccount();
            if (document.body.dataset.page === "manager" && state.profile?.role !== "admin") {
                showNotice("O painel gerencial está disponível apenas para a conta administradora.", "error");
                window.setTimeout(() => location.replace("./index.html"), 900);
            }
            window.dispatchEvent(new CustomEvent("lea:session", { detail: state }));
        } catch (error) {
            console.error("Erro ao carregar a sessão.", error);
            showNotice(`Não foi possível carregar a conta: ${error.message}`, "error");
        }
    }

    async function initialize() {
        updateAccount();
        const config = window.LEA_SUPABASE_CONFIG || {};
        if (!config.url || !config.anonKey) {
            showNotice("Para ativar login, campanhas compartilhadas e reservas, configure o Supabase em supabase-config.js e aplique supabase-schema.sql. Consulte README.md.", "error");
            return state;
        }
        if (!window.supabase?.createClient) {
            showNotice("Não foi possível carregar o Supabase. Verifique a conexão e recarregue.", "error");
            return state;
        }
        state.client = window.supabase.createClient(config.url, config.anonKey);
        state.client.auth.onAuthStateChange((_event, session) => {
            window.setTimeout(() => syncSession(session), 0);
        });
        const { data, error } = await state.client.auth.getSession();
        if (error) throw error;
        await syncSession(data.session);
        return state;
    }

    const api = {
        state,
        ready: null,
        showNotice,
        escapeHtml,
        formatMoney,
        formatNumber,
        formatDate,
        campaignLink,
        shareCampaign,
        async signOut() {
            if (!state.client) return;
            const { error } = await state.client.auth.signOut();
            if (error) throw error;
            location.assign("./index.html");
        }
    };
    window.leaRifas = api;

    document.addEventListener("click", (event) => {
        const link = event.target.closest('[data-action="account"]');
        if (!link || !state.session) return;
        event.preventDefault();
        api.signOut().catch((error) => showNotice(`Não foi possível sair: ${error.message}`, "error"));
    });

    api.ready = initialize().catch((error) => {
        console.error("Erro ao inicializar o aplicativo.", error);
        showNotice(`Não foi possível conectar ao Supabase: ${error.message}`, "error");
        return state;
    });
})();
