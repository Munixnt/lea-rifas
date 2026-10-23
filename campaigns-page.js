(() => {
    "use strict";

    const { ready, state, escapeHtml, formatMoney, formatDate, formatNumber, shareCampaign, showNotice } = window.leaRifas;
    const list = document.querySelector("#campaign-list");

    async function loadCampaigns() {
        await ready;
        if (!state.client) {
            list.innerHTML = '<p class="empty">Configure o Supabase para publicar e acessar campanhas.</p>';
            return;
        }
        const { data, error } = await state.client.from("campaigns")
            .select("id,name,prize_amount,ticket_price,draw_date,status,drawn_number,winner_published,winner_name_public")
            .order("created_at", { ascending: false });
        if (error) throw error;
        if (!data?.length) {
            list.innerHTML = '<p class="empty">Ainda não há campanhas publicadas.</p>';
            return;
        }
        list.innerHTML = data.map((campaign) => {
            const archived = campaign.status === "archived";
            const winner = archived && campaign.winner_published
                ? `<p><strong>Resultado:</strong> dezena ${formatNumber(campaign.drawn_number)}${campaign.winner_name_public ? ` — ${escapeHtml(campaign.winner_name_public)}` : ""}</p>`
                : "";
            return `<article class="campaign-card">
                <span class="badge${archived ? " archived" : ""}">${archived ? "Encerrada" : "Aberta"}</span>
                <h2>${escapeHtml(campaign.name)}</h2>
                <div class="campaign-meta">
                    <div>Prêmio: <strong>${formatMoney(campaign.prize_amount)}</strong></div>
                    <div>Dezena: <strong>${formatMoney(campaign.ticket_price)}</strong></div>
                    ${campaign.draw_date ? `<div>Sorteio: ${formatDate(campaign.draw_date)}</div>` : ""}
                    ${winner}
                </div>
                <div class="card-actions">
                    <a class="button small" href="./campanha.html?campanha=${encodeURIComponent(campaign.id)}">${archived ? "Ver resultado" : "Escolher dezenas"}</a>
                    ${!archived ? `<button type="button" class="button secondary small" data-action="share" data-id="${campaign.id}">Compartilhar link</button>` : ""}
                </div>
            </article>`;
        }).join("");
    }

    list.addEventListener("click", (event) => {
        const button = event.target.closest('[data-action="share"]');
        if (button) shareCampaign(button.dataset.id);
    });

    ready.then(loadCampaigns).catch((error) => {
        console.error("Erro ao carregar campanhas.", error);
        showNotice(`Não foi possível carregar as campanhas: ${error.message}`, "error");
        list.innerHTML = '<p class="empty">Erro ao carregar campanhas. Recarregue a página para tentar novamente.</p>';
    });
})();
