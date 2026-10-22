(() => {
    "use strict";

    const { ready, state, showNotice } = window.leaRifas;
    const $ = (selector) => document.querySelector(selector);
    const params = new URLSearchParams(location.search);
    const requestedReturn = params.get("retorno");
    const returnTo = requestedReturn?.startsWith("./campanha.html?") ? requestedReturn : null;
    let mode = "login";
    let redirectPromise = null;

    function renderForm() {
        const signup = mode === "signup";
        $("#auth-title").textContent = signup ? "Criar sua conta" : "Entrar na sua conta";
        $("#auth-hint").textContent = signup
            ? "Use seu celular como usuário e informe um telefone para contato."
            : "Entre com seu celular como usuário e sua senha.";
        $("#signup-fields").classList.toggle("hidden", !signup);
        $("#auth-name").required = signup;
        $("#auth-phone").required = true;
        $("#auth-password").autocomplete = signup ? "new-password" : "current-password";
        $("#auth-submit").textContent = signup ? "Criar conta" : "Entrar";
        $("#auth-switch-hint").textContent = signup ? "Já tem uma conta?" : "Ainda não tem conta?";
        $("#auth-switch").textContent = signup ? "Entrar" : "Criar conta";
    }

    function normalizeBrazilianPhone(value) {
        const digits = value.replace(/\D/g, "");
        if (/^55\d{10,11}$/.test(digits)) return `+${digits}`;
        if (/^\d{10,11}$/.test(digits)) return `+55${digits}`;
        throw new Error("Informe um celular brasileiro com DDD, por exemplo (77) 99999-9999.");
    }

    function authEmailForPhone(phone) {
        return `${phone.replace(/\D/g, "")}@login.lea-rifas.invalid`;
    }

    function authErrorMessage(error) {
        const message = error.message.toLowerCase();
        if (message.includes("email signups are disabled") || message.includes("signups not allowed")) {
            return "O cadastro está desativado no Supabase. Habilite novos cadastros e o provedor E-mail em Authentication → Entrar / Fornecedores, deixando a confirmação de e-mail desligada. O site usa um endereço interno; ninguém precisa informar ou receber e-mail.";
        }
        return error.message;
    }

    function redirectAfterLogin(session = state.session) {
        if (redirectPromise) return redirectPromise;
        redirectPromise = (async () => {
            if (returnTo) {
                location.replace(returnTo);
                return;
            }
            const { data, error } = await state.client.from("profiles")
                .select("id, display_name, phone, role").eq("id", session.user.id).maybeSingle();
            if (error) throw error;
            state.profile = data;
            location.replace(state.profile?.role === "admin" ? "./painel.html" : "./index.html");
        })().catch((error) => {
            redirectPromise = null;
            throw error;
        });
        return redirectPromise;
    }

    $("#auth-switch").addEventListener("click", () => {
        mode = mode === "login" ? "signup" : "login";
        renderForm();
    });

    $("#auth-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        await ready;
        if (!state.client) return;
        $("#auth-submit").disabled = true;
        try {
            let result;
            const phone = normalizeBrazilianPhone($("#auth-phone").value);
            const password = $("#auth-password").value;
            if (mode === "signup") {
                result = await state.client.auth.signUp({
                    email: authEmailForPhone(phone),
                    password,
                    options: { data: { display_name: $("#auth-name").value.trim(), phone } }
                });
                if (result.error) throw result.error;
                if (!result.data.session) {
                    throw new Error("O Supabase exige confirmação da conta. Habilite o provedor E-mail e desative a confirmação de e-mail nas configurações de autenticação.");
                }
            } else {
                result = await state.client.auth.signInWithPassword({ email: authEmailForPhone(phone), password });
                if (result.error) throw result.error;
            }
            if (result.data.session) {
                state.session = result.data.session;
                await redirectAfterLogin(result.data.session);
            }
        } catch (error) {
            console.error("Erro de autenticação.", error);
            showNotice(`Não foi possível autenticar: ${authErrorMessage(error)}`, "error");
        } finally {
            $("#auth-submit").disabled = false;
        }
    });

    window.addEventListener("lea:session", () => {
        if (state.session) redirectAfterLogin().catch((error) => {
            console.error("Erro ao redirecionar após autenticação.", error);
            showNotice(`Não foi possível carregar a conta: ${error.message}`, "error");
        });
    });

    renderForm();
    ready.then(() => {
        if (!state.client) {
            $("#auth-submit").disabled = true;
            $("#auth-switch").disabled = true;
        } else if (state.session) {
            redirectAfterLogin().catch((error) => {
                console.error("Erro ao redirecionar após autenticação.", error);
                showNotice(`Não foi possível carregar a conta: ${error.message}`, "error");
            });
        }
    });
})();
