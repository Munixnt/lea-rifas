(() => {
    "use strict";

    const { ready, state, formatMoney, formatDate, formatNumber, showNotice } = window.leaRifas;
    const selected = new Set();
    let campaign;
    let reserved = new Map();
    let initialization;
    const $ = (selector) => document.querySelector(selector);

    function renderNumbers() {
        const archived = campaign?.status !== "active";
        $("#campaign-numbers").innerHTML = Array.from({ length: 100 }, (_, number) => {
            const status = reserved.get(number);
            const isSelected = selected.has(number);
            const kind = status === "confirmed" ? "paid" : status ? "reserved" : isSelected ? "selected" : "";
            const label = status ? "🍀" : formatNumber(number);
            return `<button type="button" class="number ${kind}" data-number="${number}" aria-label="Dezena ${formatNumber(number)}" ${status || archived ? "disabled" : ""}>${label}</button>`;
        }).join("");
        const count = selected.size;
        $("#selection-summary").textContent = count
            ? `${count} dezena${count === 1 ? "" : "s"}: ${[...selected].sort((a, b) => a - b).map(formatNumber).join(", ")}`
            : "Nenhuma dezena selecionada";
        $("#selection-total").textContent = count ? `Total: ${formatMoney(count * Number(campaign.ticket_price))}` : "";
    }

    async function loadCampaign(id) {
        const { data: campaignData, error: campaignError } = await state.client.from("campaigns")
            .select("id,name,prize_amount,ticket_price,draw_date,status,drawn_number,winner_published,winner_name_public")
            .eq("id", id).maybeSingle();
        if (campaignError) throw campaignError;
        if (!campaignData) {
            showNotice("Esta campanha não existe ou não está publicada.", "error");
            return;
        }
        campaign = campaignData;
        const { data, error } = await state.client.from("campaign_number_status")
            .select("ticket_number,status").eq("campaign_id", id);
        if (error) throw error;
        reserved = new Map((data || []).map((ticket) => [ticket.ticket_number, ticket.status]));
        $("#campaign-title").textContent = campaign.name;
        $("#campaign-description").textContent = campaign.status === "active"
            ? `Prêmio ${formatMoney(campaign.prize_amount)} · cada dezena ${formatMoney(campaign.ticket_price)}${campaign.draw_date ? ` · sorteio ${formatDate(campaign.draw_date)}` : ""}`
            : `Campanha encerrada · prêmio ${formatMoney(campaign.prize_amount)}`;
        if (campaign.status === "archived" && campaign.winner_published) {
            $("#campaign-result").textContent = `Resultado oficial: dezena ${formatNumber(campaign.drawn_number)}${campaign.winner_name_public ? ` — ${campaign.winner_name_public}` : ""}. Boa sorte na próxima!`;
            $("#campaign-result").classList.remove("hidden");
        } else {
            $("#campaign-result").classList.add("hidden");
        }
        $("#selection-bar").classList.toggle("hidden", campaign.status !== "active");
        renderNumbers();

        const pending = new URLSearchParams(location.search).get("dezenas");
        if (state.session && pending) {
            for (const value of pending.split(",")) {
                const number = Number(value);
                if (Number.isInteger(number) && number >= 0 && number <= 99 && !reserved.has(number)) selected.add(number);
            }
            renderNumbers();
            if (selected.size) await reserve();
            history.replaceState(null, "", `./campanha.html?campanha=${encodeURIComponent(id)}`);
        }
    }

    function toggleNumber(number) {
        if (reserved.has(number) || campaign?.status !== "active") return;
        if (selected.has(number)) selected.delete(number);
        else selected.add(number);
        renderNumbers();
    }

    async function reserve() {
        if (!campaign || selected.size === 0) {
            showNotice("Selecione pelo menos uma dezena disponível.", "error");
            return;
        }
        if (!state.session) {
            const numbers = [...selected].sort((a, b) => a - b).map(formatNumber).join(",");
            const returnTo = `./campanha.html?campanha=${encodeURIComponent(campaign.id)}&dezenas=${encodeURIComponent(numbers)}`;
            location.assign(`./entrar.html?retorno=${encodeURIComponent(returnTo)}`);
            return;
        }
        const button = $("#reserve-button");
        button.disabled = true;
        try {
            const numbers = [...selected].sort((a, b) => a - b);
            const { error } = await state.client.rpc("reserve_campaign_numbers", {
                p_campaign_id: campaign.id,
                p_numbers: numbers
            });
            if (error) throw error;
            const message = `Olá, Lea! Fiz uma reserva na campanha *${campaign.name}*.\n\nDezenas: ${numbers.map(formatNumber).join(", ")}\nValor total: ${formatMoney(numbers.length * Number(campaign.ticket_price))}\n\nEstou enviando o comprovante Pix para confirmar a compra.`;
            selected.clear();
            await loadCampaign(campaign.id);
            $("#campaign-result").innerHTML = `Reserva pendente criada. <a href="https://wa.me/5573998216141?text=${encodeURIComponent(message)}" target="_blank" rel="noopener noreferrer">Enviar comprovante pelo WhatsApp</a>`;
            $("#campaign-result").classList.remove("hidden");
            showNotice("Sua reserva está pendente. Envie o comprovante pelo WhatsApp para a Lea confirmar o pagamento.", "success");
        } catch (error) {
            console.error("Erro ao reservar as dezenas.", error);
            showNotice(`Não foi possível concluir a reserva: ${error.message}`, "error");
            await loadCampaign(campaign.id);
        } finally {
            button.disabled = false;
        }
    }

    function initialize() {
        if (initialization) return initialization;
        initialization = (async () => {
            await ready;
            if (!state.client) return;
            const id = new URLSearchParams(location.search).get("campanha");
            if (!id) {
                showNotice("Abra uma campanha pelo link de divulgação para escolher dezenas.");
                return;
            }
            await loadCampaign(id);
        })();
        return initialization.finally(() => {
            initialization = null;
        });
    }

    $("#campaign-numbers").addEventListener("click", (event) => {
        const button = event.target.closest("[data-number]");
        if (button) toggleNumber(Number(button.dataset.number));
    });
    $("#reserve-button").addEventListener("click", () => reserve().catch((error) => showNotice(error.message, "error")));
    window.addEventListener("lea:session", () => initialize().catch((error) => {
        console.error("Erro ao abrir a campanha.", error);
        showNotice(`Não foi possível abrir a campanha: ${error.message}`, "error");
    }));
    initialize().catch((error) => {
        console.error("Erro ao abrir a campanha.", error);
        showNotice(`Não foi possível abrir a campanha: ${error.message}`, "error");
    });
})();
